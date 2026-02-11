import { organizationClient } from "better-auth/client/plugins";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions } from "../src/types";

/**
 * Create a mock that mimics Stripe's list()
 */
function mockStripeList<T>(data: T[]) {
	return {
		data,
		has_more: false,
		async *[Symbol.asyncIterator]() {
			for (const item of data) yield item;
		},
	};
}

describe("metered billing", async () => {
	const meterEventsCreate = vi.fn().mockResolvedValue({});
	const metersListEventSummaries = vi.fn();
	const metersList = vi.fn().mockReturnValue(
		mockStripeList([
			{ event_name: "stripe_meter_emails", id: "meter_emails_id" },
			{ event_name: "stripe_meter_api", id: "meter_api_id" },
		]),
	);

	const mockStripe = {
		prices: { list: vi.fn().mockResolvedValue({ data: [] }) },
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_mock123" }),
			list: vi.fn().mockResolvedValue({ data: [] }),
			search: vi.fn().mockResolvedValue({ data: [] }),
			retrieve: vi.fn().mockResolvedValue({
				id: "cus_mock123",
				deleted: false,
			}),
			update: vi.fn(),
		},
		checkout: {
			sessions: {
				create: vi.fn().mockResolvedValue({
					url: "https://checkout.stripe.com/mock",
					id: "cs_mock",
				}),
			},
		},
		billingPortal: {
			sessions: {
				create: vi
					.fn()
					.mockResolvedValue({ url: "https://billing.stripe.com/mock" }),
			},
		},
		subscriptions: {
			retrieve: vi.fn(),
			list: vi.fn().mockResolvedValue({ data: [] }),
			update: vi.fn(),
		},
		webhooks: { constructEventAsync: vi.fn() },
		billing: {
			meterEvents: { create: meterEventsCreate },
			meters: {
				list: metersList,
				listEventSummaries: metersListEventSummaries,
			},
		},
	};

	const stripeOptions = {
		stripeClient: mockStripe as unknown as Stripe,
		stripeWebhookSecret: "test_secret",
		createCustomerOnSignUp: false,
		organization: { enabled: true },
		subscription: {
			enabled: true,
			plans: [{ priceId: "price_starter", name: "starter" }],
			meters: [
				{ eventName: "stripe_meter_emails" },
				{ eventName: "stripe_meter_api" },
			],
			authorizeReference: async () => true,
		},
	} satisfies StripeOptions;

	const { auth, client, sessionSetter } = await getTestInstance(
		{ plugins: [organization(), stripe(stripeOptions)] },
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [organizationClient(), stripeClient({ subscription: true })],
			},
		},
	);
	const ctx = await auth.$context;

	const testUser = {
		email: "metered@test.com",
		password: "password",
		name: "Metered Test",
	};
	await client.signUp.email(testUser, { throw: true });
	const headers = new Headers();
	await client.signIn.email(testUser, {
		throw: true,
		onSuccess: sessionSetter(headers),
	});
	const user = (await ctx.adapter.findOne<{ id: string }>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	}))!;
	await ctx.adapter.update({
		model: "user",
		update: { stripeCustomerId: "cus_test_user" },
		where: [{ field: "id", value: user.id }],
	});
	const userId = user.id;

	const { stripeIngestUsage } = auth.api;

	beforeEach(() => {
		vi.clearAllMocks();
		metersList.mockReturnValue(
			mockStripeList([
				{ event_name: "stripe_meter_emails", id: "meter_emails_id" },
				{ event_name: "stripe_meter_api", id: "meter_api_id" },
			]),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// =========================================================================
	// Ingest usage events
	// =========================================================================

	it("should require authentication", async () => {
		await expect(
			stripeIngestUsage({
				body: {
					events: [{ meter: "stripe_meter_emails", value: 1 }],
				},
			}),
		).rejects.toThrow();
	});

	it("should send a meter event for a user", async () => {
		const result = await stripeIngestUsage({
			headers,
			body: {
				events: [{ meter: "stripe_meter_emails", value: 10 }],
			},
		});

		expect(result).toEqual([{ meter: "stripe_meter_emails", success: true }]);
		expect(meterEventsCreate).toHaveBeenCalledWith({
			event_name: "stripe_meter_emails",
			payload: {
				stripe_customer_id: "cus_test_user",
				value: "10",
			},
			timestamp: undefined,
			identifier: undefined,
		});
	});

	it("should report per-event success and failure in batch", async () => {
		meterEventsCreate
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("Stripe rate limit exceeded"));

		const result = await stripeIngestUsage({
			headers,
			body: {
				events: [
					{ meter: "stripe_meter_emails", value: 1 },
					{ meter: "stripe_meter_api", value: 1 },
				],
			},
		});

		expect(result[0]).toEqual({ meter: "stripe_meter_emails", success: true });
		expect(result[1]).toMatchObject({
			meter: "stripe_meter_api",
			success: false,
			error: "Stripe rate limit exceeded",
		});
	});

	it("should fail when meter name is not in config", async () => {
		const result = await stripeIngestUsage({
			headers,
			body: {
				events: [{ meter: "nonexistent", value: 1 }],
			},
		});

		expect(result[0]?.success).toBe(false);
		expect(result[0]?.error).toBeDefined();
	});

	it("should support organization customerType", async () => {
		const org = await client.organization.create({
			name: "Test Org",
			slug: "test-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_meter" },
			where: [{ field: "id", value: orgId }],
		});

		const result = await stripeIngestUsage({
			headers,
			body: {
				events: [{ meter: "stripe_meter_emails", value: 3 }],
				customerType: "organization",
			},
		});

		expect(result[0]).toEqual({ meter: "stripe_meter_emails", success: true });
		expect(meterEventsCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				payload: expect.objectContaining({
					stripe_customer_id: "cus_org_meter",
				}),
			}),
		);

		// Clean up: remove activeOrganizationId
		await ctx.adapter.update({
			model: "session",
			update: { activeOrganizationId: null },
			where: [{ field: "userId", value: userId }],
		});
	});

	it("should forward timestamp and identifier to Stripe", async () => {
		const ts = "2025-06-15T12:00:00Z";
		const identifier = "idempotency-abc123";

		await stripeIngestUsage({
			headers,
			body: {
				events: [
					{
						meter: "stripe_meter_emails",
						value: 5,
						timestamp: ts,
						identifier,
					},
				],
			},
		});

		expect(meterEventsCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				timestamp: Math.floor(new Date(ts).getTime() / 1000),
				identifier,
			}),
		);
	});

	// =========================================================================
	// Query usage summaries
	// =========================================================================

	it("should require authentication", async () => {
		const res = await client.subscription.usage({
			query: { meter: "stripe_meter_emails" },
		});

		expect(res.error?.status).toBe(401);
	});

	it("should return formatted usage summaries", async () => {
		const startTs = Math.floor(Date.now() / 1000) - 3600;
		const endTs = Math.floor(Date.now() / 1000);

		metersListEventSummaries.mockResolvedValue({
			data: [
				{
					id: "summary_1",
					aggregated_value: 42,
					start_time: startTs,
					end_time: endTs,
				},
			],
			has_more: false,
		});

		const res = await client.subscription.usage({
			query: {
				meter: "stripe_meter_emails",
				referenceId: userId,
			},
			fetchOptions: { headers },
		});

		expect(res.data).toMatchObject({
			data: [
				{
					id: "summary_1",
					aggregatedValue: 42,
					startTime: new Date(startTs * 1000),
					endTime: new Date(endTs * 1000),
				},
			],
			hasMore: false,
		});
	});

	it("should support pagination and grouping options", async () => {
		metersListEventSummaries.mockResolvedValue({
			data: [
				{
					id: "summary_page2",
					aggregated_value: 10,
					start_time: Math.floor(Date.now() / 1000) - 3600,
					end_time: Math.floor(Date.now() / 1000),
				},
			],
			has_more: true,
		});

		const res = await client.subscription.usage({
			query: {
				meter: "stripe_meter_emails",
				referenceId: userId,
				limit: 10,
				startingAfter: "summary_prev",
				groupingWindow: "day",
			},
			fetchOptions: { headers },
		});

		expect(res.data?.hasMore).toBe(true);
		expect(res.data?.lastId).toBe("summary_page2");
		expect(metersListEventSummaries).toHaveBeenCalledWith(
			"meter_emails_id",
			expect.objectContaining({
				limit: 10,
				starting_after: "summary_prev",
				value_grouping_window: "day",
			}),
		);
	});

	it("should return usage summaries for organization customerType", async () => {
		const org = await client.organization.create({
			name: "Usage Query Org",
			slug: "usage-query-org",
			fetchOptions: { headers },
		});
		const orgId = org.data?.id as string;
		await ctx.adapter.update({
			model: "organization",
			update: { stripeCustomerId: "cus_org_usage" },
			where: [{ field: "id", value: orgId }],
		});

		const startTs = Math.floor(Date.now() / 1000) - 3600;
		const endTs = Math.floor(Date.now() / 1000);
		metersListEventSummaries.mockResolvedValue({
			data: [
				{
					id: "summary_org",
					aggregated_value: 100,
					start_time: startTs,
					end_time: endTs,
				},
			],
			has_more: false,
		});

		const res = await client.subscription.usage({
			query: {
				meter: "stripe_meter_emails",
				customerType: "organization",
			},
			fetchOptions: { headers },
		});

		expect(res.data?.data[0]?.aggregatedValue).toBe(100);
		expect(metersListEventSummaries).toHaveBeenCalledWith(
			"meter_emails_id",
			expect.objectContaining({
				customer: "cus_org_usage",
			}),
		);

		// Clean up: remove activeOrganizationId
		await ctx.adapter.update({
			model: "session",
			update: { activeOrganizationId: null },
			where: [{ field: "userId", value: userId }],
		});
	});

	it("should fail when the meter is not registered in Stripe", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		metersList.mockReturnValueOnce(mockStripeList([]));

		const res = await client.subscription.usage({
			query: {
				meter: "stripe_meter_emails",
				referenceId: userId,
			},
			fetchOptions: { headers },
		});

		expect(res.error?.status).toBe(400);
	});
});

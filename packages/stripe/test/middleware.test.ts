import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions, Subscription } from "../src/types";
import { test } from "./_fixtures";

const testUser = {
	email: "test@email.com",
	password: "password",
	name: "Test User",
};

describe("referenceMiddleware", () => {
	describe("referenceMiddleware - user subscription", () => {
		test("should pass when no explicit referenceId is provided", async ({
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(testUser, { throw: true });
			const headers = new Headers();
			await client.signIn.email(testUser, {
				throw: true,
				onSuccess: sessionSetter(headers),
			});

			const res = await client.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			expect(res.error).toBeNull();
			expect(res.data?.url).toBeDefined();
		});

		test("should pass when referenceId equals user id", async ({
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const signUpRes = await client.signUp.email(
				{ ...testUser, email: "ref-test-2@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "ref-test-2@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				referenceId: signUpRes.user.id,
				fetchOptions: { headers },
			});

			expect(res.error).toBeNull();
			expect(res.data?.url).toBeDefined();
		});

		test("should reject when authorizeReference is not defined but other referenceId is provided", async ({
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "ref-test-3@example.com" },
				{ throw: true },
			);
			const targetUser = await client.signUp.email(
				{ ...testUser, email: "ref-target-3@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "ref-test-3@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				referenceId: targetUser.user.id,
				fetchOptions: { headers },
			});

			expect(res.error?.code).toBe("REFERENCE_ID_NOT_ALLOWED");
		});

		test("should reject another user's referenceId when authorizeReference returns false", async ({
			stripeOptions,
		}) => {
			const stripeOptionsWithAuth: StripeOptions = {
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					authorizeReference: async () => false,
				},
			};

			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptionsWithAuth)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "ref-test-4@example.com" },
				{ throw: true },
			);
			const targetUser = await client.signUp.email(
				{ ...testUser, email: "ref-target-4@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "ref-test-4@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				referenceId: targetUser.user.id,
				fetchOptions: { headers },
			});

			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		test("should allow another user's referenceId when authorizeReference returns true", async ({
			stripeMock,
			stripeOptions,
		}) => {
			const stripeOptionsWithAuth: StripeOptions = {
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					authorizeReference: async () => true,
				},
			};

			const { auth, client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptionsWithAuth)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const actorUser = await client.signUp.email(
				{ ...testUser, email: "ref-test-5@example.com" },
				{ throw: true },
			);
			const targetUser = await client.signUp.email(
				{ ...testUser, email: "ref-target-5@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: actorUser.user.email },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const ctx = await auth.$context;
			await ctx.adapter.update({
				model: "user",
				update: {
					stripeCustomerId: "cus_actor_reference",
				},
				where: [{ field: "id", value: actorUser.user.id }],
			});
			await ctx.adapter.update({
				model: "user",
				update: {
					stripeCustomerId: "cus_target_reference",
				},
				where: [{ field: "id", value: targetUser.user.id }],
			});
			stripeMock.checkout.sessions.create.mockClear();

			const res = await client.subscription.upgrade({
				plan: "starter",
				referenceId: targetUser.user.id,
				fetchOptions: { headers },
			});

			expect(res.error).toBeNull();
			expect(res.data?.url).toBeDefined();
			expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
				expect.objectContaining({
					customer: "cus_actor_reference",
					metadata: expect.objectContaining({
						userId: actorUser.user.id,
						referenceId: targetUser.user.id,
					}),
				}),
				undefined,
			);
			const subscription = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [{ field: "referenceId", value: targetUser.user.id }],
			});
			expect(subscription).toMatchObject({
				referenceId: targetUser.user.id,
				status: "incomplete",
			});
		});
	});

	describe("referenceMiddleware - organization subscription", () => {
		test("should reject when authorizeReference is not defined", async ({
			stripeOptions,
		}) => {
			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "org-test-1@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "org-test-1@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				customerType: "organization",
				referenceId: "org_123",
				fetchOptions: { headers },
			});

			expect(res.error?.code).toBe("AUTHORIZE_REFERENCE_REQUIRED");
		});

		test("should reject when no referenceId or activeOrganizationId", async ({
			stripeOptions,
		}) => {
			const stripeOptionsWithAuth: StripeOptions = {
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					authorizeReference: async () => true,
				},
			};

			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptionsWithAuth)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "org-test-2@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "org-test-2@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				customerType: "organization",
				fetchOptions: { headers },
			});

			expect(res.error?.code).toBe("ORGANIZATION_REFERENCE_ID_REQUIRED");
		});

		test("should reject when authorizeReference returns false", async ({
			stripeOptions,
		}) => {
			const stripeOptionsWithAuth: StripeOptions = {
				...stripeOptions,
				subscription: {
					...stripeOptions.subscription,
					authorizeReference: async () => false,
				},
			};

			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptionsWithAuth)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "org-test-3@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "org-test-3@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				customerType: "organization",
				referenceId: "org_123",
				fetchOptions: { headers },
			});

			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		test("should pass when authorizeReference returns true", async ({
			stripeOptions,
		}) => {
			const stripeOptionsWithAuth: StripeOptions = {
				...stripeOptions,
				organization: {
					enabled: true,
				},
				subscription: {
					...stripeOptions.subscription,
					authorizeReference: async () => true,
				},
			};

			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [stripe(stripeOptionsWithAuth)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			await client.signUp.email(
				{ ...testUser, email: "org-test-4@example.com" },
				{ throw: true },
			);
			const headers = new Headers();
			await client.signIn.email(
				{ ...testUser, email: "org-test-4@example.com" },
				{
					throw: true,
					onSuccess: sessionSetter(headers),
				},
			);

			const res = await client.subscription.upgrade({
				plan: "starter",
				customerType: "organization",
				referenceId: "org_123",
				fetchOptions: { headers },
			});

			// Should pass middleware but may fail later due to org not existing
			// We're testing middleware authorization, not the full flow
			expect(res.error?.code).not.toBe("ORGANIZATION_SUBSCRIPTION_NOT_ENABLED");
			expect(res.error?.code).not.toBe("UNAUTHORIZED");
		});
	});
});

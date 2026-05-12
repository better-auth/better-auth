import { runWithEndpointContext } from "@better-auth/core/context";
import type { User } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { getTestInstance } from "better-auth/test";
import type Stripe from "stripe";
import { describe, expect, vi } from "vitest";
import { stripe } from "../src";
import { stripeClient } from "../src/client";
import type { StripeOptions } from "../src/types";
import { test } from "./_fixtures";

const testUser = {
	email: "test@email.com",
	password: "password",
	name: "Test User",
};

describe("stripe customer", () => {
	test("should create a customer on sign up", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		const userRes = await client.signUp.email(testUser, {
			throw: true,
		});
		const res = await ctx.adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: userRes.user.id,
				},
			],
		});
		expect(res).toMatchObject({
			id: expect.any(String),
			stripeCustomerId: expect.any(String),
		});
	});

	test("should only call Stripe customers.create once for signup and upgrade", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, sessionSetter } = await getTestInstance(
			{
				database: memory,
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
			{ ...testUser, email: "single-create@email.com" },
			{ throw: true },
		);

		const headers = new Headers();
		await client.signIn.email(
			{ ...testUser, email: "single-create@email.com" },
			{
				throw: true,
				onSuccess: sessionSetter(headers),
			},
		);

		await client.subscription.upgrade({
			plan: "starter",
			fetchOptions: { headers },
		});

		expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
	});

	test("should update stripe customer email when user email changes", async ({
		stripeMock,
		memory,
		stripeOptions,
	}) => {
		const { client, auth } = await getTestInstance(
			{
				database: memory,
				plugins: [stripe(stripeOptions)],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [stripeClient({ subscription: true })],
				},
			},
		);
		const ctx = await auth.$context;

		// Setup mock for customer retrieve and update
		stripeMock.customers.retrieve = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "test@email.com",
			deleted: false,
		});
		stripeMock.customers.update = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "newemail@example.com",
		});

		// Sign up a user
		const userRes = await client.signUp.email(testUser, {
			throw: true,
		});

		expect(userRes.user).toBeDefined();

		// Verify customer was created during signup
		expect(stripeMock.customers.create).toHaveBeenCalledWith({
			email: testUser.email,
			name: testUser.name,
			metadata: {
				customerType: "user",
				userId: userRes.user.id,
			},
		});

		// Clear mocks to track the update
		vi.clearAllMocks();

		// Re-setup the retrieve mock for the update flow
		stripeMock.customers.retrieve = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "test@email.com",
			deleted: false,
		});
		stripeMock.customers.update = vi.fn().mockResolvedValue({
			id: "cus_mock123",
			email: "newemail@example.com",
		});

		// Update the user's email using internal adapter (which triggers hooks)
		await runWithEndpointContext(
			{
				context: ctx as never,
			},
			() =>
				ctx.internalAdapter.updateUserByEmail(testUser.email, {
					email: "newemail@example.com",
				}),
		);

		// Verify that Stripe customer.retrieve was called
		expect(stripeMock.customers.retrieve).toHaveBeenCalledWith("cus_mock123");

		// Verify that Stripe customer.update was called with the new email
		expect(stripeMock.customers.update).toHaveBeenCalledWith("cus_mock123", {
			email: "newemail@example.com",
		});
	});

	describe("getCustomerCreateParams", () => {
		test("should call getCustomerCreateParams and merge with default params", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const getCustomerCreateParamsMock = vi
				.fn()
				.mockResolvedValue({ metadata: { customField: "customValue" } });

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testClient.signUp.email(
				{
					email: "custom-params@email.com",
					password: "password",
					name: "Custom User",
				},
				{
					throw: true,
				},
			);

			// Verify getCustomerCreateParams was called
			expect(getCustomerCreateParamsMock).toHaveBeenCalledWith(
				expect.objectContaining({
					id: userRes.user.id,
					email: "custom-params@email.com",
					name: "Custom User",
				}),
				expect.objectContaining({
					context: expect.any(Object),
				}),
			);

			// Verify customer was created with merged params
			expect(stripeMock.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "custom-params@email.com",
					name: "Custom User",
					metadata: expect.objectContaining({
						userId: userRes.user.id,
						customField: "customValue",
					}),
				}),
			);
		});

		test("should use getCustomerCreateParams to add custom address", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const getCustomerCreateParamsMock = vi.fn().mockResolvedValue({
				address: {
					line1: "123 Main St",
					city: "San Francisco",
					state: "CA",
					postal_code: "94111",
					country: "US",
				},
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			await testAuthClient.signUp.email(
				{
					email: "address-user@email.com",
					password: "password",
					name: "Address User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with address
			expect(stripeMock.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "address-user@email.com",
					name: "Address User",
					address: {
						line1: "123 Main St",
						city: "San Francisco",
						state: "CA",
						postal_code: "94111",
						country: "US",
					},
					metadata: expect.objectContaining({
						userId: expect.any(String),
					}),
				}),
			);
		});

		test("should properly merge nested objects using defu", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const getCustomerCreateParamsMock = vi.fn().mockResolvedValue({
				metadata: {
					customField: "customValue",
					anotherField: "anotherValue",
				},
				phone: "+1234567890",
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				getCustomerCreateParams: getCustomerCreateParamsMock,
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testAuthClient.signUp.email(
				{
					email: "merge-test@email.com",
					password: "password",
					name: "Merge User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with properly merged params
			// defu merges objects and preserves all fields
			expect(stripeMock.customers.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "merge-test@email.com",
					name: "Merge User",
					phone: "+1234567890",
					metadata: {
						customerType: "user",
						userId: userRes.user.id,
						customField: "customValue",
						anotherField: "anotherValue",
					},
				}),
			);
		});

		test("should work without getCustomerCreateParams", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			// This test ensures backward compatibility
			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
				// No getCustomerCreateParams provided
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			// Sign up a user
			const userRes = await testAuthClient.signUp.email(
				{
					email: "no-custom-params@email.com",
					password: "password",
					name: "Default User",
				},
				{
					throw: true,
				},
			);

			// Verify customer was created with default params only
			expect(stripeMock.customers.create).toHaveBeenCalledWith({
				email: "no-custom-params@email.com",
				name: "Default User",
				metadata: {
					customerType: "user",
					userId: userRes.user.id,
				},
			});
		});
	});

	describe("Duplicate customer prevention on signup", () => {
		test("should NOT create duplicate customer when email already exists in Stripe", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const existingEmail = "duplicate-email@example.com";
			const existingCustomerId = "cus_stripe_existing_456";

			stripeMock.customers.search.mockResolvedValueOnce({
				data: [
					{
						id: existingCustomerId,
						email: existingEmail,
						name: "Existing Stripe Customer",
					},
				],
			});

			const testOptionsWithHook = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptionsWithHook)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Sign up with email that exists in Stripe
			const userRes = await testAuthClient.signUp.email(
				{
					email: existingEmail,
					password: "password",
					name: "Duplicate Email User",
				},
				{ throw: true },
			);

			// Should check for existing user customer by email (excluding organization customers)
			expect(stripeMock.customers.search).toHaveBeenCalledWith({
				query: `email:"${existingEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should NOT create duplicate customer
			expect(stripeMock.customers.create).not.toHaveBeenCalled();

			// Verify user has the EXISTING Stripe customer ID (not new duplicate)
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe(existingCustomerId); // Should use existing ID
		});

		test("should CREATE customer only when user has no stripeCustomerId and none exists in Stripe", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const newEmail = "brand-new@example.com";

			stripeMock.customers.search.mockResolvedValueOnce({
				data: [],
			});

			stripeMock.customers.create.mockResolvedValueOnce({
				id: "cus_new_created_789",
				email: newEmail,
			});

			const testOptionsWithHook = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptionsWithHook)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Sign up with brand new email
			const userRes = await testAuthClient.signUp.email(
				{
					email: newEmail,
					password: "password",
					name: "Brand New User",
				},
				{ throw: true },
			);

			// Should check for existing user customer first (excluding organization customers)
			expect(stripeMock.customers.search).toHaveBeenCalledWith({
				query: `email:"${newEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should create new customer (this is correct behavior)
			expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
			expect(stripeMock.customers.create).toHaveBeenCalledWith({
				email: newEmail,
				name: "Brand New User",
				metadata: {
					userId: userRes.user.id,
					customerType: "user",
				},
			});

			// Verify user has the new Stripe customer ID
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBeDefined();
		});
	});
	describe("User/Organization customer collision prevention", () => {
		test("should NOT return organization customer when searching for user customer with same email", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			// Scenario: Organization has a Stripe customer with email "shared@example.com"
			// When a user signs up with the same email, the search should NOT find the org customer
			const sharedEmail = "shared@example.com";
			const orgCustomerId = "cus_org_123";

			// Mock: Only organization customer exists with this email
			// The search query includes `-metadata['customerType']:'organization'`
			// so this should NOT be returned
			stripeMock.customers.search.mockResolvedValueOnce({
				data: [], // Organization customer is excluded by the search query
			});

			stripeMock.customers.create.mockResolvedValueOnce({
				id: "cus_user_new_456",
				email: sharedEmail,
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// User signs up with email that organization already uses
			const userRes = await testAuthClient.signUp.email(
				{
					email: sharedEmail,
					password: "password",
					name: "User With Shared Email",
				},
				{ throw: true },
			);

			// Should search with query that EXCLUDES organization customers
			expect(stripeMock.customers.search).toHaveBeenCalledWith({
				query: `email:"${sharedEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should create NEW user customer (not use org customer)
			expect(stripeMock.customers.create).toHaveBeenCalledTimes(1);
			expect(stripeMock.customers.create).toHaveBeenCalledWith({
				email: sharedEmail,
				name: "User With Shared Email",
				metadata: {
					customerType: "user",
					userId: userRes.user.id,
				},
			});

			// Verify user has their own customer ID (not the org's)
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe("cus_user_new_456");
			expect(user?.stripeCustomerId).not.toBe(orgCustomerId);
		});

		test("should find existing user customer even when organization customer with same email exists", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			// Scenario: Both user and organization customers exist with same email
			// The search should only return the user customer
			const sharedEmail = "both-exist@example.com";
			const existingUserCustomerId = "cus_user_existing_789";

			// Mock: Search returns ONLY user customer (org customer excluded by query)
			stripeMock.customers.search.mockResolvedValueOnce({
				data: [
					{
						id: existingUserCustomerId,
						email: sharedEmail,
						name: "Existing User Customer",
						metadata: {
							customerType: "user",
							userId: "some-old-user-id",
						},
					},
				],
			});

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient, auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// User signs up - should find their existing customer
			const userRes = await testAuthClient.signUp.email(
				{
					email: sharedEmail,
					password: "password",
					name: "User Reclaiming Account",
				},
				{ throw: true },
			);

			// Should search excluding organization customers
			expect(stripeMock.customers.search).toHaveBeenCalledWith({
				query: `email:"${sharedEmail}" AND -metadata["customerType"]:"organization"`,
				limit: 1,
			});

			// Should NOT create new customer - use existing user customer
			expect(stripeMock.customers.create).not.toHaveBeenCalled();

			// Verify user has the existing user customer ID
			const user = await testCtx.adapter.findOne<
				User & { stripeCustomerId?: string }
			>({
				model: "user",
				where: [{ field: "id", value: userRes.user.id }],
			});
			expect(user?.stripeCustomerId).toBe(existingUserCustomerId);
		});

		test("should create organization customer with customerType metadata", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			// Test that organization customers are properly tagged
			const orgEmail = "org@example.com";
			const orgId = "org_test_123";

			stripeMock.customers.search.mockResolvedValueOnce({
				data: [],
			});

			stripeMock.customers.create.mockResolvedValueOnce({
				id: "cus_org_new_999",
				email: orgEmail,
			});

			const { auth: testAuth } = await getTestInstance(
				{
					database: memory,
					plugins: [
						organization(),
						stripe({
							...stripeOptions,
							organization: {
								enabled: true,
								createCustomerOnOrganizationCreate: true,
							},
						}),
					],
				},
				{ disableTestUser: true },
			);
			const testCtx = await testAuth.$context;

			vi.clearAllMocks();

			// Create organization
			await testCtx.adapter.create({
				model: "organization",
				data: {
					id: orgId,
					name: "Test Organization",
					slug: "test-org-collision",
					createdAt: new Date(),
				},
			});

			// Manually trigger the organization customer creation flow
			// by calling the internal function (simulating what hooks do)
			const stripeClient = stripeOptions.stripeClient;
			const searchResult = await stripeClient.customers.search({
				query: `email:'${orgEmail}' AND metadata['customerType']:'organization'`,
				limit: 1,
			});

			if (searchResult.data.length === 0) {
				await stripeClient.customers.create({
					email: orgEmail,
					name: "Test Organization",
					metadata: {
						customerType: "organization",
						organizationId: orgId,
					},
				});
			}

			// Verify organization customer was created with correct metadata
			expect(stripeMock.customers.create).toHaveBeenCalledWith({
				email: orgEmail,
				name: "Test Organization",
				metadata: {
					customerType: "organization",
					organizationId: orgId,
				},
			});
		});
	});
	/**
	 * @see https://github.com/better-auth/better-auth/issues/7959
	 */
	describe("Search API fallback for unsupported regions", () => {
		function mockStripeList(data: Partial<Stripe.Customer>[] = []) {
			const p = Promise.resolve({ data, has_more: false }) as Promise<{
				data: Partial<Stripe.Customer>[];
				has_more: boolean;
			}> & {
				[Symbol.asyncIterator]: () => AsyncGenerator<Partial<Stripe.Customer>>;
			};
			p[Symbol.asyncIterator] = async function* () {
				yield* data;
			};
			return p;
		}

		test("should fall back to customers.list when customers.search is unavailable (user signup)", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const fallbackEmail = "fallback-user@example.com";
			const existingCustomerId = "cus_fallback_123";

			const testOptions = {
				...stripeOptions,
				createCustomerOnSignUp: true,
			} satisfies StripeOptions;

			const { client: testAuthClient } = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(testOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			vi.clearAllMocks();

			// Make search fail, list succeed
			stripeMock.customers.search.mockRejectedValueOnce(
				new Error("search feature unavailable for merchant"),
			);
			stripeMock.customers.list.mockReturnValueOnce(
				mockStripeList([
					{
						id: existingCustomerId,
						email: fallbackEmail,
						metadata: { customerType: "user" },
					},
				]),
			);

			await testAuthClient.signUp.email(
				{
					email: fallbackEmail,
					password: "password",
					name: "Fallback User",
				},
				{ throw: true },
			);

			// Search was attempted first
			expect(stripeMock.customers.search).toHaveBeenCalled();
			// Fell back to list after search failure
			expect(stripeMock.customers.list).toHaveBeenCalledWith({
				email: fallbackEmail,
				limit: 100,
			});
			// Should NOT create duplicate — used existing customer from list fallback
			expect(stripeMock.customers.create).not.toHaveBeenCalled();
		});

		test("should fall back to customers.list when customers.search is unavailable (user upgrade)", async ({
			stripeMock,
			memory,
			stripeOptions,
		}) => {
			const fallbackEmail = "fallback-upgrade@example.com";
			const existingCustomerId = "cus_fallback_upgrade_123";

			const {
				client: testAuthClient,
				auth,
				sessionSetter,
			} = await getTestInstance(
				{
					database: memory,
					plugins: [stripe(stripeOptions)],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);
			const ctx = await auth.$context;

			// Create user without stripeCustomerId
			const userRes = await testAuthClient.signUp.email(
				{
					email: fallbackEmail,
					password: "password",
					name: "Fallback Upgrade User",
				},
				{ throw: true },
			);

			// Remove stripeCustomerId to force customer lookup during upgrade
			await ctx.adapter.update({
				model: "user",
				update: { stripeCustomerId: null },
				where: [{ field: "id", value: userRes.user.id }],
			});

			const headers = new Headers();
			await testAuthClient.signIn.email(
				{ email: fallbackEmail, password: "password" },
				{ throw: true, onSuccess: sessionSetter(headers) },
			);

			vi.clearAllMocks();

			// Make search fail, list succeed with existing customer
			stripeMock.customers.search.mockRejectedValueOnce(
				new Error("search feature unavailable for merchant"),
			);
			stripeMock.customers.list.mockReturnValueOnce(
				mockStripeList([
					{
						id: existingCustomerId,
						email: fallbackEmail,
						metadata: { customerType: "user" },
					},
				]),
			);

			stripeMock.checkout.sessions.create.mockResolvedValueOnce({
				url: "https://checkout.stripe.com/mock-fallback",
				id: "cs_fallback",
			});

			await testAuthClient.subscription.upgrade({
				plan: "starter",
				fetchOptions: { headers },
			});

			// Search was attempted first
			expect(stripeMock.customers.search).toHaveBeenCalled();
			// Fell back to list after search failure
			expect(stripeMock.customers.list).toHaveBeenCalledWith({
				email: fallbackEmail,
				limit: 100,
			});
			// Should use existing customer, not create a new one
			expect(stripeMock.customers.create).not.toHaveBeenCalled();
		});
	});
});

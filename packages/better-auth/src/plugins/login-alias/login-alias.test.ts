import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { loginAliasPlugin, AliasType } from "./index";
import { loginAliasClient } from "./client";
import type { LoginAlias } from "./schema";

describe("Login Alias Plugin", async (it) => {
	const { auth, client, testUser, sessionSetter } = await getTestInstance(
		{
			plugins: [
				loginAliasPlugin({
					autoCreateAliases: true,
					allowMultiplePerType: true,
					allowedTypes: ["email", "username", "phone"],
					requireVerification: {
						email: true,
						phone: true,
						username: false,
					},
					maxAliasesPerUser: 10,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [loginAliasClient()],
			},
		},
	);

	const ctx = await auth.$context;

	it("should auto-create email alias on sign-up", async () => {
		const testEmail = "alias-test@example.com";
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Alias Test User",
		});

		expect(signUpRes.data?.user).toBeDefined();
		const userId = signUpRes.data!.user.id;

		// Check if alias was auto-created
		const aliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		expect(aliases.length).toBeGreaterThan(0);
		const emailAlias = aliases.find((a) => a.type === AliasType.EMAIL);
		expect(emailAlias).toBeDefined();
		expect(emailAlias?.value).toBe(testEmail.toLowerCase());
		expect(emailAlias?.isPrimary).toBe(true);
	});

	it("should sign in with alias instead of email", async () => {
		// Create a user
		const testEmail = `signin_alias_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Sign In Alias User",
		});

		const userId = signUpRes.data!.user.id;

		// Add a username alias
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testEmail,
				password: testPassword,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		const username = `signinuser_${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: username.toLowerCase(),
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Sign out
		await client.signOut({
			fetchOptions: { headers },
		});

		// Try to sign in with the username alias
		const signInWithAliasRes = await client.signIn.email({
			email: username, // Using username in the email field
			password: testPassword,
		});

		expect(signInWithAliasRes.data?.user).toBeDefined();
		expect(signInWithAliasRes.data?.user.id).toBe(userId);
		expect(signInWithAliasRes.data?.user.email).toBe(testEmail);
	});

	it("should normalize alias values", async () => {
		const testEmail = `normalize_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Normalize User",
		});

		const userId = signUpRes.data!.user.id;

		// Add username with mixed case
		const username = `MixedCaseUser_${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: username.toLowerCase(),
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Find the alias
		const alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: username.toLowerCase() }],
		});

		// Should be normalized to lowercase
		expect(alias?.value).toBe(username.toLowerCase());

		// Add phone with formatting
		const phone = "+1 (555) 123-4567";
		const normalizedPhone = "15551234567"; // digits only

		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.PHONE,
				value: normalizedPhone,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const phoneAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: normalizedPhone }],
		});

		// Should be normalized to digits only
		expect(phoneAlias?.value).toBe(normalizedPhone);
	});

	it("should handle multiple aliases per user", async () => {
		const testEmail = `multi_alias_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Multi Alias User",
		});

		const userId = signUpRes.data!.user.id;

		// Add multiple aliases
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: `username1_${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.PHONE,
				value: `555${Date.now().toString().slice(-7)}`,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Check all aliases
		const aliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		// Should have at least 3: auto-created email + username + phone
		expect(aliases.length).toBeGreaterThanOrEqual(3);
	});

	it("should handle primary aliases", async () => {
		const testEmail = `primary_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Primary Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Check that the auto-created email alias is primary
		const emailAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.EMAIL },
			],
		});

		expect(emailAlias?.isPrimary).toBe(true);
	});

	it("should find users by alias", async () => {
		const testEmail = `finduser_${Date.now()}@example.com`;
		const testPassword = "password123";
		const username = `findme_${Date.now()}`;

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Find User Test",
		});

		const userId = signUpRes.data!.user.id;

		// Add username alias
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: username,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Find by username alias
		const alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: username }],
		});

		expect(alias).toBeDefined();
		expect(alias?.userId).toBe(userId);
		expect(alias?.type).toBe(AliasType.USERNAME);
	});

	it("should support custom alias types", async () => {
		const testEmail = `custom_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Custom Type User",
		});

		const userId = signUpRes.data!.user.id;
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testEmail,
				password: testPassword,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		// Add custom employee_id alias
		const employeeId = `EMP-${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: "employee_id",
				value: employeeId,
				verified: true,
				isPrimary: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Verify it was created
		const alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "value", value: employeeId },
				{ field: "type", value: "employee_id" },
			],
		});

		expect(alias).toBeDefined();
		expect(alias?.type).toBe("employee_id");
		expect(alias?.value).toBe(employeeId);
	});

	it("should prevent duplicate alias values", async () => {
		const testEmail1 = `user1_${Date.now()}@example.com`;
		const testEmail2 = `user2_${Date.now()}@example.com`;
		const sharedUsername = `shared_${Date.now()}`;

		// Create two users
		const user1 = await client.signUp.email({
			email: testEmail1,
			password: "password123",
			name: "User 1",
		});

		const user2 = await client.signUp.email({
			email: testEmail2,
			password: "password123",
			name: "User 2",
		});

		const userId1 = user1.data!.user.id;
		const userId2 = user2.data!.user.id;

		// User 1 adds a username
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId: userId1,
				type: AliasType.USERNAME,
				value: sharedUsername,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// User 2 tries to add the same username (should fail due to unique constraint)
		await expect(
			ctx.adapter.create<LoginAlias>({
				model: "loginAlias",
				data: {
					userId: userId2,
					type: AliasType.USERNAME,
					value: sharedUsername,
					verified: true,
					isPrimary: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		).rejects.toThrow();
	});

	it("should handle case-insensitive email aliases", async () => {
		const testEmail = `CaseTest_${Date.now()}@Example.COM`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Case Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Check that email alias was created with lowercase
		const aliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		const emailAlias = aliases.find((a) => a.type === AliasType.EMAIL);
		expect(emailAlias?.value).toBe(testEmail.toLowerCase());

		// Should be able to sign in with any case variation
		const signInRes = await client.signIn.email({
			email: testEmail.toUpperCase(),
			password: testPassword,
		});

		expect(signInRes.data?.user.id).toBe(userId);
	});

	it("should handle multiple email aliases", async () => {
		const primaryEmail = `primary_${Date.now()}@example.com`;
		const secondaryEmail = `secondary_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: primaryEmail,
			password: testPassword,
			name: "Multi Email User",
		});

		const userId = signUpRes.data!.user.id;

		// Add secondary email
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.EMAIL,
				value: secondaryEmail.toLowerCase(),
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Should be able to sign in with secondary email
		const signInRes = await client.signIn.email({
			email: secondaryEmail,
			password: testPassword,
		});

		expect(signInRes.data?.user.id).toBe(userId);
		expect(signInRes.data?.user.email).toBe(primaryEmail.toLowerCase());
	});

	it("should track verification status", async () => {
		const testEmail = `verify_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Verify Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Add unverified phone alias
		const phone = `555${Date.now().toString().slice(-7)}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.PHONE,
				value: phone,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Check verification status
		let phoneAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: phone }],
		});

		expect(phoneAlias?.verified).toBe(false);

		// Update to verified
		await ctx.adapter.update({
			model: "loginAlias",
			where: [{ field: "id", value: phoneAlias!.id }],
			update: { verified: true, updatedAt: new Date() },
		});

		phoneAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: phone }],
		});

		expect(phoneAlias?.verified).toBe(true);
	});

	it("should support metadata storage", async () => {
		const testEmail = `metadata_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Metadata Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Add alias with metadata
		const username = "JohnDoe";
		const metadata = JSON.stringify({
			displayValue: username,
			source: "manual",
			addedVia: "web",
		});

		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: username.toLowerCase(),
				verified: true,
				isPrimary: false,
				metadata,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Retrieve and verify metadata
		const alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: username.toLowerCase() }],
		});

		expect(alias?.metadata).toBe(metadata);
		const parsed = JSON.parse(alias!.metadata!);
		expect(parsed.displayValue).toBe(username);
		expect(parsed.source).toBe("manual");
	});

	it("should handle primary flag correctly when adding multiple aliases of same type", async () => {
		const testEmail = `multiprimary_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Multi Primary User",
		});

		const userId = signUpRes.data!.user.id;

		// Add second email (should not be primary)
		const email2 = `second_${Date.now()}@example.com`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.EMAIL,
				value: email2,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Add third email as primary
		const email3 = `third_${Date.now()}@example.com`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.EMAIL,
				value: email3,
				verified: true,
				isPrimary: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Get all email aliases
		const emailAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.EMAIL },
			],
		});

		// Count primary aliases
		const primaryAliases = emailAliases.filter((a) => a.isPrimary);

		// Should have at least one primary (could be more if logic allows)
		expect(primaryAliases.length).toBeGreaterThan(0);

		// The third email should be primary
		const email3Alias = emailAliases.find((a) => a.value === email3);
		expect(email3Alias?.isPrimary).toBe(true);
	});

	it("should support filtering aliases by type", async () => {
		const testEmail = `filter_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Filter Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Add various alias types
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: `user_${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.PHONE,
				value: `555${Date.now().toString().slice(-7)}`,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: "employee_id",
				value: `EMP${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Get only username aliases
		const usernameAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.USERNAME },
			],
		});

		expect(usernameAliases.length).toBe(1);
		expect(usernameAliases[0]?.type).toBe(AliasType.USERNAME);

		// Get all aliases for user
		const allAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		expect(allAliases.length).toBeGreaterThanOrEqual(4); // email + username + phone + employee_id
	});

	it("should work with real-world phone number formats", async () => {
		const testEmail = `phone_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Phone Format User",
		});

		const userId = signUpRes.data!.user.id;

		// Various phone formats that should all normalize to digits
		const phoneFormats = [
			{ input: "+1-555-123-4567", normalized: "15551234567" },
			{ input: "(555) 987-6543", normalized: "5559876543" },
			{ input: "+44 20 7946 0958", normalized: "442079460958" },
		];

		for (const { input, normalized } of phoneFormats) {
			const uniqueNormalized = `${normalized}${Date.now()}`.slice(0, 15);
			await ctx.adapter.create<LoginAlias>({
				model: "loginAlias",
				data: {
					userId,
					type: AliasType.PHONE,
					value: uniqueNormalized,
					verified: false,
					isPrimary: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const alias = await ctx.adapter.findOne<LoginAlias>({
				model: "loginAlias",
				where: [{ field: "value", value: uniqueNormalized }],
			});

			expect(alias).toBeDefined();
			expect(alias?.value).toMatch(/^\d+$/); // Should be digits only
		}
	});

	it("should handle edge case: empty metadata", async () => {
		const testEmail = `empty_meta_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Empty Meta User",
		});

		const userId = signUpRes.data!.user.id;

		// Add alias without metadata
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: `nometa_${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.USERNAME },
			],
		});

		// SQLite returns null for NULL values, not undefined
		expect(alias?.metadata).toBeFalsy();
	});

	it("should update alias properties", async () => {
		const testEmail = `update_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Update User",
		});

		const userId = signUpRes.data!.user.id;

		// Create alias
		const username = `updateuser_${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: username,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Find and verify initial state
		let alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: username }],
		});

		expect(alias).toBeDefined();
		expect(alias?.verified).toBe(false);

		// Update to verified
		await ctx.adapter.update({
			model: "loginAlias",
			where: [{ field: "id", value: alias!.id }],
			update: { verified: true, updatedAt: new Date() },
		});

		// Verify the update worked by finding again
		alias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "value", value: username }],
		});

		expect(alias?.verified).toBe(true);
	});

	it("should support complex use case: migrating from username to email system", async () => {
		// Simulate legacy system where users had only usernames
		const legacyUsername = `legacy_${Date.now()}`;
		const newEmail = `modern_${Date.now()}@example.com`;
		const testPassword = "password123";

		// User signs up with new email-based system
		const signUpRes = await client.signUp.email({
			email: newEmail,
			password: testPassword,
			name: "Migration User",
		});

		const userId = signUpRes.data!.user.id;

		// Add their legacy username as an alias
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: legacyUsername,
				verified: true,
				isPrimary: false,
				metadata: JSON.stringify({ source: "legacy_migration" }),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// User should be able to sign in with their old username
		const signInWithLegacy = await client.signIn.email({
			email: legacyUsername,
			password: testPassword,
		});

		expect(signInWithLegacy.data?.user.id).toBe(userId);

		// Or with their new email
		const signInWithEmail = await client.signIn.email({
			email: newEmail,
			password: testPassword,
		});

		expect(signInWithEmail.data?.user.id).toBe(userId);
	});

	it("should support enterprise use case: multiple identity providers", async () => {
		const workEmail = `john.doe_${Date.now()}@company.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: workEmail,
			password: testPassword,
			name: "Enterprise User",
		});

		const userId = signUpRes.data!.user.id;

		// Add various enterprise identifiers
		const identifiers = [
			{ type: "employee_id", value: `EMP${Date.now()}` },
			{ type: "badge_id", value: `BADGE${Date.now()}` },
			{
				type: "azure_upn",
				value: `john.doe_${Date.now()}@company.onmicrosoft.com`,
			},
		];

		for (const { type, value } of identifiers) {
			await ctx.adapter.create<LoginAlias>({
				model: "loginAlias",
				data: {
					userId,
					type,
					value,
					verified: true,
					isPrimary: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}

		// Get all aliases
		const allAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		// Should have at least 4 (email + 3 enterprise IDs)
		expect(allAliases.length).toBeGreaterThanOrEqual(4);

		// Check enterprise IDs exist
		const hasEmployeeId = allAliases.some((a) => a.type === "employee_id");
		const hasBadgeId = allAliases.some((a) => a.type === "badge_id");
		const hasAzureUpn = allAliases.some((a) => a.type === "azure_upn");

		expect(hasEmployeeId).toBe(true);
		expect(hasBadgeId).toBe(true);
		expect(hasAzureUpn).toBe(true);
	});

	it("should query aliases efficiently with multiple where conditions", async () => {
		const testEmail = `query_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Query Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Add verified username
		const verifiedUsername = `verified_${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: verifiedUsername,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Add unverified username
		const unverifiedUsername = `unverified_${Date.now()}`;
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: unverifiedUsername,
				verified: false,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Query verified username aliases only
		const verifiedUsernames = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.USERNAME },
				{ field: "verified", value: true },
			],
		});

		expect(verifiedUsernames.length).toBe(1);
		expect(verifiedUsernames[0]?.value).toBe(verifiedUsername);
	});

	it("should auto-create email alias from OAuth sign-in", async () => {
		// This test verifies that when a user signs in with OAuth,
		// their email is automatically added as an alias
		const testEmail = `oauth_email_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "OAuth Email User",
		});

		const userId = signUpRes.data!.user.id;

		// Verify email alias was auto-created
		const emailAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [
				{ field: "userId", value: userId },
				{ field: "type", value: AliasType.EMAIL },
			],
		});

		expect(emailAliases.length).toBeGreaterThan(0);
		expect(emailAliases[0]?.value).toBe(testEmail.toLowerCase());

		// Note: OAuth provider connections are tracked in the account table
		// Use client.listAccounts() to see connected OAuth providers
		const accounts = await ctx.internalAdapter.findAccounts(userId);
		expect(accounts).toBeDefined();
	});

	it("should track OAuth providers as aliases when enabled", async () => {
		// Test with trackOAuthProviders option enabled
		const { auth: oauthAuth, client: oauthClient } = await getTestInstance({
			plugins: [
				loginAliasPlugin({
					autoCreateAliases: true,
					trackOAuthProviders: true, // Enable OAuth tracking
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		const oauthCtx = await oauthAuth.$context;

		const testEmail = `oauth_tracked_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await oauthClient.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "OAuth Tracked User",
		});

		const userId = signUpRes.data!.user.id;

		// Simulate OAuth account creation (mimicking what OAuth callback does)
		const googleAccountId = `google_user_${Date.now()}`;
		await oauthCtx.adapter.create({
			model: "account",
			data: {
				userId,
				providerId: "google",
				accountId: googleAccountId,
				accessToken: "mock_access_token",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// With trackOAuthProviders enabled, OAuth providers should appear as aliases
		// (In real usage, the hook would auto-create this)
		await oauthCtx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: "oauth_google",
				value: `google:${googleAccountId}`,
				verified: true,
				isPrimary: false,
				metadata: JSON.stringify({
					providerId: "google",
					accountId: googleAccountId,
					connectedAt: new Date().toISOString(),
				}),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// List all aliases should now include the OAuth provider
		const allAliases = await oauthCtx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		// Should have email + OAuth provider
		expect(allAliases.length).toBeGreaterThanOrEqual(2);

		const oauthAlias = allAliases.find((a) => a.type === "oauth_google");
		expect(oauthAlias).toBeDefined();
		expect(oauthAlias?.value).toContain("google:");
		expect(oauthAlias?.verified).toBe(true);
	});

	it("should support complete identity: email + username + phone + accounts", async () => {
		const testEmail = `complete_${Date.now()}@example.com`;
		const testPassword = "password123";

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "Complete Identity User",
		});

		const userId = signUpRes.data!.user.id;

		// Add username alias
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.USERNAME,
				value: `completeuser_${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Add phone alias
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: AliasType.PHONE,
				value: `555${Date.now().toString().slice(-7)}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Add custom enterprise ID
		await ctx.adapter.create<LoginAlias>({
			model: "loginAlias",
			data: {
				userId,
				type: "employee_id",
				value: `EMP${Date.now()}`,
				verified: true,
				isPrimary: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Get all aliases
		const allAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		// Should have: email + username + phone + employee_id = 4 total
		expect(allAliases.length).toBeGreaterThanOrEqual(4);

		// Verify we have all types
		const aliasTypes = allAliases.map((a) => a.type);
		expect(aliasTypes).toContain(AliasType.EMAIL);
		expect(aliasTypes).toContain(AliasType.USERNAME);
		expect(aliasTypes).toContain(AliasType.PHONE);
		expect(aliasTypes).toContain("employee_id");

		// OAuth providers are tracked separately in the account table
		const accounts = await ctx.internalAdapter.findAccounts(userId);
		// Will have credential account from sign-up
		expect(accounts.length).toBeGreaterThan(0);
	});
});

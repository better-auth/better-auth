import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { loginAliasPlugin, AliasType } from "./index";
import type { LoginAlias } from "./schema";

describe("Login Alias Plugin", async () => {
	const { auth, client, testUser, cookieSetter } = await getTestInstance({
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
	});

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

	it("should list user aliases", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const listRes = await client.$fetch("/alias/list", {
			method: "GET",
			headers,
		});

		expect(listRes.status).toBe(200);
		const aliases = await listRes.json();
		expect(Array.isArray(aliases)).toBe(true);
	});

	it("should add a new alias", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const newUsername = `testuser_${Date.now()}`;
		const addRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: newUsername,
				verified: true,
			},
		});

		expect(addRes.status).toBe(200);
		const alias = await addRes.json();
		expect(alias.type).toBe(AliasType.USERNAME);
		expect(alias.value).toBe(newUsername.toLowerCase());
		expect(alias.verified).toBe(true);
	});

	it("should not allow duplicate aliases", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const username = `duplicate_${Date.now()}`;

		// Add first alias
		await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
			},
		});

		// Try to add duplicate
		const duplicateRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
			},
		});

		expect(duplicateRes.status).toBe(400);
	});

	it("should make an alias primary", async () => {
		const headers = new Headers();
		const signInRes = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const userId = signInRes.data!.user.id;

		// Add two email aliases
		const email1 = `primary1_${Date.now()}@example.com`;
		const email2 = `primary2_${Date.now()}@example.com`;

		const alias1Res = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.EMAIL,
				value: email1,
				verified: true,
			},
		});

		const alias1 = await alias1Res.json();

		const alias2Res = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.EMAIL,
				value: email2,
				verified: true,
			},
		});

		const alias2 = await alias2Res.json();

		// Make second alias primary
		const makePrimaryRes = await client.$fetch("/alias/make-primary", {
			method: "POST",
			headers,
			body: {
				aliasId: alias2.id,
			},
		});

		expect(makePrimaryRes.status).toBe(200);

		// Verify that only alias2 is primary
		const allAliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		const emailAliases = allAliases.filter((a) => a.type === AliasType.EMAIL);
		const primary = emailAliases.find((a) => a.id === alias2.id);
		const notPrimary = emailAliases.find((a) => a.id === alias1.id);

		expect(primary?.isPrimary).toBe(true);
		expect(notPrimary?.isPrimary).toBe(false);
	});

	it("should remove an alias", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Add alias
		const username = `remove_${Date.now()}`;
		const addRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
			},
		});

		const alias = await addRes.json();

		// Remove alias
		const removeRes = await client.$fetch("/alias/remove", {
			method: "POST",
			headers,
			body: {
				aliasId: alias.id,
			},
		});

		expect(removeRes.status).toBe(200);

		// Verify alias is removed
		const removedAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "id", value: alias.id }],
		});

		expect(removedAlias).toBeNull();
	});

	it("should not allow removing the last login method", async () => {
		// Create a user with only one alias
		const testEmail = `onlyalias_${Date.now()}@example.com`;
		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Only Alias User",
		});

		const userId = signUpRes.data!.user.id;

		// Remove the credential account to simulate user with only alias
		const accounts = await ctx.adapter.findMany({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});

		for (const account of accounts) {
			await ctx.adapter.delete({
				model: "account",
				where: [{ field: "id", value: account.id }],
			});
		}

		const headers = new Headers();
		// Sign in with the new user
		await client.signIn.email(
			{
				email: testEmail,
				password: "password123",
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Get the alias
		const aliases = await ctx.adapter.findMany<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "userId", value: userId }],
		});

		expect(aliases.length).toBeGreaterThan(0);

		// Try to remove the last alias
		const removeRes = await client.$fetch("/alias/remove", {
			method: "POST",
			headers,
			body: {
				aliasId: aliases[0]!.id,
			},
		});

		expect(removeRes.status).toBe(400);
	});

	it("should verify an alias", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Add unverified alias
		const phone = `555${Date.now().toString().slice(-7)}`;
		const addRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.PHONE,
				value: phone,
				verified: false,
			},
		});

		const alias = await addRes.json();
		expect(alias.verified).toBe(false);

		// Verify alias
		const verifyRes = await client.$fetch("/alias/verify", {
			method: "POST",
			headers,
			body: {
				aliasId: alias.id,
			},
		});

		expect(verifyRes.status).toBe(200);

		// Check if verified
		const verifiedAlias = await ctx.adapter.findOne<LoginAlias>({
			model: "loginAlias",
			where: [{ field: "id", value: alias.id }],
		});

		expect(verifiedAlias?.verified).toBe(true);
	});

	it("should find user by alias", async () => {
		const headers = new Headers();
		const signInRes = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const userId = signInRes.data!.user.id;

		// Add alias
		const username = `findme_${Date.now()}`;
		await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
				verified: true,
			},
		});

		// Find user by alias
		const findRes = await client.$fetch("/alias/find-user", {
			method: "POST",
			body: {
				value: username,
				type: AliasType.USERNAME,
			},
		});

		expect(findRes.status).toBe(200);
		const result = await findRes.json();
		expect(result.userId).toBe(userId);
		expect(result.verified).toBe(true);
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
				onSuccess: cookieSetter(headers),
			},
		);

		const username = `signinuser_${Date.now()}`;
		await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
				verified: true,
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

	it("should validate alias values", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Try to add invalid username
		const invalidUsernameRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: "ab", // Too short
			},
		});

		expect(invalidUsernameRes.status).toBe(400);

		// Try to add invalid email
		const invalidEmailRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.EMAIL,
				value: "notanemail",
			},
		});

		expect(invalidEmailRes.status).toBe(400);

		// Try to add invalid phone
		const invalidPhoneRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.PHONE,
				value: "123", // Too short
			},
		});

		expect(invalidPhoneRes.status).toBe(400);
	});

	it("should normalize alias values", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Add username with mixed case
		const username = `MixedCaseUser_${Date.now()}`;
		const addRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: username,
			},
		});

		const alias = await addRes.json();
		// Should be normalized to lowercase
		expect(alias.value).toBe(username.toLowerCase());

		// Add phone with formatting
		const phone = "+1 (555) 123-4567";
		const phoneRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.PHONE,
				value: phone,
			},
		});

		const phoneAlias = await phoneRes.json();
		// Should be normalized to digits only
		expect(phoneAlias.value).toBe("15551234567");
	});

	it("should respect max aliases per user", async () => {
		// Create a new user to avoid conflicts with other tests
		const testEmail = `maxalias_${Date.now()}@example.com`;
		await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Max Alias User",
		});

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testEmail,
				password: "password123",
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		// Add aliases up to the limit (10, but one is auto-created)
		for (let i = 0; i < 9; i++) {
			const username = `maxuser_${Date.now()}_${i}`;
			await client.$fetch("/alias/add", {
				method: "POST",
				headers,
				body: {
					type: AliasType.USERNAME,
					value: username,
				},
			});
		}

		// Try to add one more (should fail)
		const overLimitRes = await client.$fetch("/alias/add", {
			method: "POST",
			headers,
			body: {
				type: AliasType.USERNAME,
				value: `overlimit_${Date.now()}`,
			},
		});

		expect(overLimitRes.status).toBe(400);
	});
});

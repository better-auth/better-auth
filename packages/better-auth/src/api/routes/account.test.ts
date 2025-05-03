import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import type { GoogleProfile } from "../../social-providers";
import { DEFAULT_SECRET } from "../../utils/constants";
import { getOAuth2Tokens } from "../../oauth2";
import { signJWT } from "../../crypto/jwt";
import { BASE_ERROR_CODES } from "../../error/codes";

let email = "";
vi.mock("../../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (...args: any) => {
				const data: GoogleProfile = {
					email,
					email_verified: true,
					name: "First Last",
					picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
					exp: 1234567890,
					sub: "1234567890",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "First",
					family_name: "Last",
				};
				const testIdToken = await signJWT(data, DEFAULT_SECRET);
				const tokens = getOAuth2Tokens({
					access_token: "test",
					refresh_token: "test",
					id_token: testIdToken,
				});
				return tokens;
			}),
	};
});

describe("account", async () => {
	const { auth, client, signInWithTestUser } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		account: {
			accountLinking: {
				allowDifferentEmails: true,
			},
		},
	});

	const ctx = await auth.$context;

	const { headers } = await signInWithTestUser();

	it("should list all accounts", async () => {
		const accounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		expect(accounts.data?.length).toBe(1);
	});

	it("should link first account", async () => {
		const linkAccountRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				headers,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${cookies.get("better-auth.state")?.value}`,
					);
				},
			},
		);
		expect(linkAccountRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(linkAccountRes.data!.url).searchParams.get("state") || "";
		email = "test@test.com";
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			method: "GET",
			headers,
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");
			},
		});

		const { headers: headers2 } = await signInWithTestUser();
		const accounts = await client.listAccounts({
			fetchOptions: { headers: headers2 },
		});
		expect(accounts.data?.length).toBe(2);
	});

	it("should pass custom scopes to authorization URL", async () => {
		const { headers: headers2 } = await signInWithTestUser();
		const customScope = "https://www.googleapis.com/auth/drive.readonly";
		const linkAccountRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/callback",
				scopes: [customScope],
			},
			{
				headers: headers2,
			},
		);

		expect(linkAccountRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const url = new URL(linkAccountRes.data!.url);
		const scopesParam = url.searchParams.get("scope");
		expect(scopesParam).toContain(customScope);
	});

	it("should link second account from the same provider", async () => {
		const { headers: headers2 } = await signInWithTestUser();
		const linkAccountRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				headers: headers2,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${cookies.get("better-auth.state")?.value}`,
					);
				},
			},
		);
		expect(linkAccountRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(linkAccountRes.data!.url).searchParams.get("state") || "";
		email = "test2@test.com";
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			method: "GET",
			headers,
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");
			},
		});

		const { headers: headers3 } = await signInWithTestUser();
		const accounts = await client.listAccounts({
			fetchOptions: { headers: headers3 },
		});
		expect(accounts.data?.length).toBe(2);
	});
	it("should unlink account", async () => {
		const { headers } = await signInWithTestUser();
		const previousAccounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		expect(previousAccounts.data?.length).toBe(2);
		const unlinkAccountId = previousAccounts.data![1].accountId;
		const unlinkRes = await client.unlinkAccount({
			providerId: "google",
			accountId: unlinkAccountId!,
			fetchOptions: {
				headers,
			},
		});
		expect(unlinkRes.data?.status).toBe(true);
		const accounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		expect(accounts.data?.length).toBe(1);
	});

	it("should fail to unlink the last account of a provider", async () => {
		const { headers } = await signInWithTestUser();
		const previousAccounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		await ctx.adapter.delete({
			model: "account",
			where: [
				{
					field: "providerId",
					value: "google",
				},
			],
		});
		const unlinkAccountId = previousAccounts.data![0].accountId;
		const unlinkRes = await client.unlinkAccount({
			providerId: "credential",
			accountId: unlinkAccountId,
			fetchOptions: {
				headers,
			},
		});
		expect(unlinkRes.error?.message).toBe(
			BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
		);
	});

	it("should unlink account with specific accountId", async () => {
		const { headers } = await signInWithTestUser();
		const previousAccounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		expect(previousAccounts.data?.length).toBeGreaterThan(0);

		const accountToUnlink = previousAccounts.data![0];
		const unlinkAccountId = accountToUnlink.accountId;
		const providerId = accountToUnlink.provider;
		const accountsWithSameProvider = previousAccounts.data!.filter(
			(account) => account.provider === providerId,
		);
		if (accountsWithSameProvider.length <= 1) {
			return;
		}

		const unlinkRes = await client.unlinkAccount({
			providerId,
			accountId: unlinkAccountId!,
			fetchOptions: {
				headers,
			},
		});

		expect(unlinkRes.data?.status).toBe(true);

		const accountsAfterUnlink = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});

		expect(accountsAfterUnlink.data?.length).toBe(
			previousAccounts.data!.length - 1,
		);
		expect(
			accountsAfterUnlink.data?.find((a) => a.accountId === unlinkAccountId),
		).toBeUndefined();
	});

	it("should unlink all accounts with specific providerId", async () => {
		const { headers, user } = await signInWithTestUser();
		await ctx.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "123",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await ctx.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "345",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const previousAccounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});

		const googleAccounts = previousAccounts.data!.filter(
			(account) => account.provider === "google",
		);
		expect(googleAccounts.length).toBeGreaterThan(1);

		for (let i = 0; i < googleAccounts.length - 1; i++) {
			const unlinkRes = await client.unlinkAccount({
				providerId: "google",
				accountId: googleAccounts[i].accountId!,
				fetchOptions: {
					headers,
				},
			});
			expect(unlinkRes.data?.status).toBe(true);
		}

		const accountsAfterUnlink = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});

		const remainingGoogleAccounts = accountsAfterUnlink.data!.filter(
			(account) => account.provider === "google",
		);
		expect(remainingGoogleAccounts.length).toBe(1);
	});
});

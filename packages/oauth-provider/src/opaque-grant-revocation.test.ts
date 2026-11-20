import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

const authServerBaseUrl = "http://localhost:3000";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

async function setup(testWith: "sqlite" | "postgres" | "mysql") {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] }, testWith },
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			scope: "openid profile email offline_access",
			skip_consent: true,
		},
	});
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	return { auth, client, headers, options };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	refresh_token: string;
}

/** Runs the authorization code flow without a resource, so the access token is opaque. */
async function authorize(
	{ client, headers, options }: TestServer,
	{ offline = true }: { offline?: boolean } = {},
) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: [
			"openid",
			"profile",
			"email",
			...(offline ? ["offline_access"] : []),
		],
		codeVerifier,
	});
	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
	const { body, headers: tokenHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI: redirectUri,
		options,
	});
	const tokens = (
		await client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: tokenHeaders,
		})
	).data!;
	expect(tokens.access_token.split(".")).toHaveLength(1);
	return tokens;
}

async function requestRefresh(
	{ client, options }: TestServer,
	refreshToken: string,
) {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
	});
	return client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		body,
		headers,
	});
}

async function refresh(server: TestServer, refreshToken: string) {
	return (await requestRefresh(server, refreshToken)).data!;
}

async function isActive({ client, options }: TestServer, token: string) {
	const res = await client.oauth2.introspect(
		{
			client_id: options.clientId,
			client_secret: options.clientSecret,
			token,
		},
		{ headers: formHeaders },
	);
	return res.data?.active;
}

async function revoke({ client, options }: TestServer, token: string) {
	const res = await client.oauth2.revoke(
		{
			client_id: options.clientId,
			client_secret: options.clientSecret,
			token,
		},
		{ headers: formHeaders },
	);
	expect(res.error).toBe(null);
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
 */
describe.each(["sqlite", "postgres", "mysql"] as const)(
	"oauth-provider - refresh token revocation revokes the grant's opaque access tokens on %s",
	async (testWith) => {
		const server = await setup(testWith);

		it("revokes opaque tokens from the first issue and every rotation, and leaves other grants alone", async () => {
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);
			const third = await refresh(server, second.refresh_token);
			const otherGrant = await authorize(server);

			await revoke(server, third.refresh_token);

			expect(await isActive(server, first.access_token)).toBe(false);
			expect(await isActive(server, second.access_token)).toBe(false);
			expect(await isActive(server, third.access_token)).toBe(false);
			expect(await isActive(server, otherGrant.access_token)).toBe(true);
			expect(await refresh(server, otherGrant.refresh_token)).toMatchObject({
				access_token: expect.any(String),
			});
		});

		it("stores no grant ID on an opaque token issued without a refresh token", async () => {
			const tokens = await authorize(server, { offline: false });
			expect(tokens.refresh_token).toBeUndefined();
			const ctx = await server.auth.$context;
			const rows = await ctx.adapter.findMany<{ grantId?: string | null }>({
				model: "oauthAccessToken",
				where: [
					{ field: "clientId", value: server.options.clientId },
					{ field: "refreshId", value: null },
				],
			});
			expect(rows.length).toBeGreaterThan(0);
			for (const row of rows) expect(row.grantId ?? null).toBe(null);
		});

		it("revokes the refresh token's own opaque tokens when the grant predates grant IDs", async () => {
			const grant = await authorize(server);
			const ctx = await server.auth.$context;
			for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
				await ctx.adapter.updateMany({
					model,
					where: [{ field: "clientId", value: server.options.clientId }],
					update: { grantId: null },
				});
			}

			await revoke(server, grant.refresh_token);

			expect(await isActive(server, grant.access_token)).toBe(false);
		});

		it("revokes every opaque token of the grant when revocation races a refresh", async () => {
			const first = await authorize(server);
			const second = await refresh(server, first.refresh_token);

			const [, raced] = await Promise.all([
				revoke(server, second.refresh_token),
				requestRefresh(server, second.refresh_token),
			]);

			expect(await isActive(server, first.access_token)).toBe(false);
			expect(await isActive(server, second.access_token)).toBe(false);
			// Either the refresh lost the race, or the token it minted is revoked.
			if (raced.data) {
				expect(await isActive(server, raced.data.access_token)).toBe(false);
			} else {
				expect(raced.error?.status).toBe(400);
			}
		});

		/**
		 * The reuse teardown runs after the rotation's swap and before the
		 * rotation stores its new refresh token, so its delete misses that row.
		 *
		 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
		 */
		it("fails a rotation that stores its refresh token after reuse revoked the grant", async () => {
			const ctx = await server.auth.$context;
			const readRows = () =>
				ctx.adapter.findMany<{ id: string; grantId: string }>({
					model: "oauthRefreshToken",
					where: [{ field: "clientId", value: server.options.clientId }],
					limit: 1000,
				});
			const before = new Set((await readRows()).map((row) => row.id));
			const first = await authorize(server);
			const [issued] = (await readRows()).filter((row) => !before.has(row.id));
			const create = ctx.adapter.create.bind(ctx.adapter);
			const reached = Promise.withResolvers<void>();
			const released = Promise.withResolvers<void>();
			const spy = vi.spyOn(ctx.adapter, "create");
			spy.mockImplementation(async (...args) => {
				if (args[0].model === "oauthRefreshToken") {
					spy.mockRestore();
					reached.resolve();
					await released.promise;
				}
				return create(...args);
			});
			try {
				const rotating = requestRefresh(server, first.refresh_token);
				await reached.promise;
				const reused = await requestRefresh(server, first.refresh_token);
				released.resolve();
				const rotated = await rotating;

				expect(reused.error?.status).toBe(400);
				expect(rotated.error?.status).toBe(400);
				expect(
					await ctx.adapter.count({
						model: "oauthRefreshToken",
						where: [
							{ field: "clientId", value: server.options.clientId },
							{ field: "grantId", value: issued!.grantId },
						],
					}),
				).toBe(0);
			} finally {
				released.resolve();
				spy.mockRestore();
			}
		});
	},
);

/**
 * On MySQL, the family delete can lose a deadlock to a concurrent refresh of
 * the same client and user, whose access-token insert holds a foreign-key
 * lock on its refresh row. The teardown retries its idempotent deletes.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9700#section-4.14.2
 */
describe("oauth-provider - refresh family teardown retries a failed delete", async () => {
	const server = await setup("sqlite");

	async function failRefreshTokenDeletes(times: number) {
		const ctx = await server.auth.$context;
		const deleteMany = ctx.adapter.deleteMany.bind(ctx.adapter);
		let failures = 0;
		const spy = vi.spyOn(ctx.adapter, "deleteMany");
		spy.mockImplementation(async (...args) => {
			if (args[0].model === "oauthRefreshToken" && failures < times) {
				failures++;
				throw new Error("Deadlock found when trying to get lock");
			}
			return deleteMany(...args);
		});
		const refreshTokenDeletes = () =>
			spy.mock.calls.filter(([args]) => args.model === "oauthRefreshToken")
				.length;
		return { ctx, spy, refreshTokenDeletes };
	}

	async function countRefreshTokens() {
		const ctx = await server.auth.$context;
		return ctx.adapter.count({
			model: "oauthRefreshToken",
			where: [{ field: "clientId", value: server.options.clientId }],
		});
	}

	it("revokes the family when revoking a rotated token hits a failed delete", async () => {
		const first = await authorize(server);
		const second = await refresh(server, first.refresh_token);
		const { spy } = await failRefreshTokenDeletes(1);
		try {
			await revoke(server, first.refresh_token);
		} finally {
			spy.mockRestore();
		}

		expect(await countRefreshTokens()).toBe(0);
		expect(await isActive(server, second.access_token)).toBe(false);
	});

	it("tears down the family when reuse detection hits a failed delete", async () => {
		const first = await authorize(server);
		const second = await refresh(server, first.refresh_token);
		const { ctx, spy } = await failRefreshTokenDeletes(1);
		const countGrantMarks = () =>
			ctx.adapter.count({
				model: "verification",
				where: [
					{
						field: "identifier",
						operator: "starts_with",
						value: "oauth-revoked-grant:",
					},
				],
			});
		const marksBefore = await countGrantMarks();
		let reused: Awaited<ReturnType<typeof requestRefresh>>;
		try {
			reused = await requestRefresh(server, first.refresh_token);
		} finally {
			spy.mockRestore();
		}

		expect(reused.error?.status).toBe(400);
		// The retry re-runs only the deletes, not the grant mark.
		expect(await countGrantMarks()).toBe(marksBefore + 1);
		expect(await countRefreshTokens()).toBe(0);
		expect(await isActive(server, second.access_token)).toBe(false);
		const successor = await requestRefresh(server, second.refresh_token);
		expect(successor.error?.status).toBe(400);
	});

	it("fails after three attempts when the delete keeps failing", async () => {
		const first = await authorize(server);
		await refresh(server, first.refresh_token);
		const { client, options } = server;
		const { spy, refreshTokenDeletes } = await failRefreshTokenDeletes(
			Number.POSITIVE_INFINITY,
		);
		let res: Awaited<ReturnType<typeof client.oauth2.revoke>>;
		try {
			res = await client.oauth2.revoke(
				{
					client_id: options.clientId,
					client_secret: options.clientSecret,
					token: first.refresh_token,
				},
				{ headers: formHeaders },
			);
			expect(refreshTokenDeletes()).toBe(3);
		} finally {
			spy.mockRestore();
		}

		expect(res.error?.status).toBe(500);
	});
});

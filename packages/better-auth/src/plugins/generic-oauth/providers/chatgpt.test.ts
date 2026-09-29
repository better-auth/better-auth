import { createHash } from "node:crypto";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { chatgpt, genericOAuth } from "..";
import type { ChatGPTOptions } from "./chatgpt";

const issuer = "https://auth.openai.com";
const clientId = "oaiapp_test";
const callbackURL = "http://localhost:3000/dashboard";
const discovery = {
	issuer,
	authorization_endpoint: `${issuer}/api/accounts/authorize`,
	token_endpoint: `${issuer}/api/accounts/oauth/token`,
	jwks_uri: `${issuer}/.well-known/jwks.json`,
	userinfo_endpoint: `${issuer}/api/accounts/oauth/userinfo`,
	id_token_signing_alg_values_supported: ["RS256"],
};
const server = setupServer();
const keys = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");
const jwk = await exportJWK(keys.publicKey);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function startSignIn(
	options: Partial<ChatGPTOptions> = {},
	claims: Record<string, unknown> = {},
	mode?: "forged" | "missing-token" | "token-error",
) {
	server.use(
		http.get(`${issuer}/.well-known/openid-configuration`, () =>
			HttpResponse.json(discovery),
		),
		http.get(discovery.jwks_uri, () =>
			HttpResponse.json({ keys: [{ ...jwk, kid: "test-key", alg: "RS256" }] }),
		),
	);
	const instance = await getTestInstance({
		plugins: [genericOAuth({ config: [chatgpt({ clientId, ...options })] })],
	});
	const headers = new Headers();
	const result = await instance.client.signIn.social({
		provider: "chatgpt",
		callbackURL,
		fetchOptions: { onSuccess: instance.cookieSetter(headers) },
	});
	expect(result.error).toBeNull();
	const authorization = new URL(result.data!.url!);
	const tokenRequest = vi.fn(async ({ request }: { request: Request }) => {
		const form = new URLSearchParams(await request.text());
		expect(form.get("grant_type")).toBe("authorization_code");
		expect(form.get("code")).toBe("test-code");
		expect(form.get("redirect_uri")).toBe(
			authorization.searchParams.get("redirect_uri"),
		);
		const verifier = form.get("code_verifier");
		expect(verifier).toBeTruthy();
		expect(createHash("sha256").update(verifier!).digest("base64url")).toBe(
			authorization.searchParams.get("code_challenge"),
		);
		if (mode === "token-error") {
			return HttpResponse.json({ error: "invalid_client" }, { status: 401 });
		}
		if (mode === "missing-token") {
			return HttpResponse.json({
				access_token: "access-only",
				token_type: "Bearer",
			});
		}
		const now = Math.floor(Date.now() / 1000);
		const token = await new SignJWT({
			iss: issuer,
			aud: options.clientId ?? clientId,
			sub: "chatgpt-user",
			iat: now,
			exp: now + 300,
			nonce: authorization.searchParams.get("nonce"),
			email: "chatgpt-user@example.com",
			email_verified: true,
			name: "ChatGPT User",
			picture: "https://example.com/avatar.png",
			...claims,
		})
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.sign(mode === "forged" ? otherKeys.privateKey : keys.privateKey);
		// OpenAI's website identity contract does not require OAuth access tokens.
		return HttpResponse.json({ id_token: token });
	});
	server.use(http.post(discovery.token_endpoint, tokenRequest));
	const callback = new URL(authorization.searchParams.get("redirect_uri")!);
	callback.searchParams.set("code", "test-code");
	callback.searchParams.set("state", authorization.searchParams.get("state")!);
	const complete = async () => {
		const response = await instance.auth.handler(
			new Request(callback, { headers }),
		);
		const sessionHeaders = new Headers({
			cookie: response.headers
				.getSetCookie()
				.map((cookie) => cookie.split(";")[0])
				.join("; "),
		});
		const session = await instance.client.getSession({
			fetchOptions: { headers: sessionHeaders },
		});
		return { response, session: session.data, sessionHeaders };
	};
	return { ...instance, authorization, tokenRequest, callback, complete };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11472
 * @see https://developers.openai.com/siwc/website
 */
describe("ChatGPT website sign-in", () => {
	it("creates a session from an ID-token-only response with state, PKCE and nonce", async () => {
		const flow = await startSignIn();
		const params = flow.authorization.searchParams;
		expect(flow.authorization.origin + flow.authorization.pathname).toBe(
			discovery.authorization_endpoint,
		);
		expect(params.get("client_id")).toBe(clientId);
		expect(params.get("scope")).toBe("openid profile email");
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("state")).toBeTruthy();
		expect(params.get("nonce")).toBeTruthy();
		expect(params.get("nonce")).not.toBe(params.get("state"));
		expect(params.get("redirect_uri")).toBe(
			"http://localhost:3000/api/auth/callback/chatgpt",
		);
		const { response, session, sessionHeaders } = await flow.complete();
		expect(response.headers.get("location")).toBe(callbackURL);
		expect(session?.user).toMatchObject({
			name: "ChatGPT User",
			email: "chatgpt-user@example.com",
			emailVerified: true,
			image: "https://example.com/avatar.png",
		});
		const request = flow.tokenRequest.mock.calls[0]![0].request;
		expect(request.headers.has("authorization")).toBe(false);
		const accounts = await flow.client.listAccounts({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(accounts.data?.[0]).toMatchObject({
			providerId: "chatgpt",
			accountId: JSON.stringify([issuer, clientId, "chatgpt-user"]),
		});
		const replay = await flow.complete();
		expect(replay.session).toBeNull();
		expect(flow.tokenRequest).toHaveBeenCalledTimes(1);
	});

	it.each([
		"client_secret_basic",
		"client_secret_post",
		"none",
	] as const)("uses the provisioned %s authentication method", async (method) => {
		const secret = method === "none" ? undefined : "test-secret";
		const flow = await startSignIn({
			clientSecret: secret,
			tokenEndpointAuth: { method },
		});
		let body: URLSearchParams | undefined;
		let authorization: string | null = null;
		server.use(
			http.post(discovery.token_endpoint, async (context) => {
				body = new URLSearchParams(await context.request.clone().text());
				authorization = context.request.headers.get("authorization");
				return flow.tokenRequest(context);
			}),
		);
		expect((await flow.complete()).session).not.toBeNull();
		expect(body?.get("client_id")).toBe(clientId);
		if (method === "client_secret_basic") {
			expect(authorization).toBe(
				`Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
			);
			expect(body?.has("client_secret")).toBe(false);
		} else {
			expect(authorization).toBeNull();
			expect(body?.get("client_secret")).toBe(secret ?? null);
		}
	});

	it.each([
		["issuer", { iss: "https://other.example.com" }],
		["audience", { aud: "another-client" }],
		["expired token", { exp: 1 }],
		["missing expiry", { exp: undefined }],
		["missing issued-at", { iat: undefined }],
		["missing subject", { sub: undefined }],
		["empty subject", { sub: " " }],
		["wrong nonce", { nonce: "another-transaction" }],
		["missing nonce", { nonce: undefined }],
	] as const)("rejects an ID token with %s", async (_name, claims) => {
		const flow = await startSignIn({}, claims);
		const { response, session } = await flow.complete();
		expect(response.headers.get("location")).toContain("error=");
		expect(session).toBeNull();
	});

	it.each([
		"forged",
		"missing-token",
		"token-error",
	] as const)("rejects %s without a session", async (mode) => {
		const flow = await startSignIn({}, {}, mode);
		expect((await flow.complete()).session).toBeNull();
		expect(flow.tokenRequest).toHaveBeenCalledTimes(1);
	});

	it.each([
		"mismatched",
		"missing",
		"denied",
	])("rejects %s authorization before exchanging a code", async (failure) => {
		const flow = await startSignIn();
		if (failure === "missing") flow.callback.searchParams.delete("state");
		if (failure === "mismatched")
			flow.callback.searchParams.set("state", "invalid-state");
		if (failure === "denied")
			flow.callback.searchParams.set("error", "access_denied");
		expect((await flow.complete()).session).toBeNull();
		expect(flow.tokenRequest).not.toHaveBeenCalled();
	});

	it("maps optional profile claims without treating a truthy string as verified", async () => {
		const flow = await startSignIn(
			{},
			{ name: undefined, picture: undefined, email_verified: "true" },
		);
		const { session } = await flow.complete();
		expect(session?.user).toMatchObject({
			name: "chatgpt-user@example.com",
			emailVerified: false,
		});
	});

	it("allows profile mapping while retaining client-scoped account identity", async () => {
		const flow = await startSignIn({
			clientId: "oaiapp_other",
			mapProfileToUser: () => ({ name: "Mapped name" }),
		});
		const { session, sessionHeaders } = await flow.complete();
		expect(session?.user.name).toBe("Mapped name");
		const accounts = await flow.client.listAccounts({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(accounts.data?.[0]?.accountId).toBe(
			JSON.stringify([issuer, "oaiapp_other", "chatgpt-user"]),
		);
	});

	it("does not sign the user out of ChatGPT", async () => {
		const flow = await startSignIn();
		const { sessionHeaders } = await flow.complete();
		const result = await flow.client.signOut({
			fetchOptions: { headers: sessionHeaders },
		});
		expect(result.error).toBeNull();
		expect(
			(
				await flow.client.getSession({
					fetchOptions: { headers: sessionHeaders },
				})
			).data,
		).toBeNull();
	});

	it.each([
		"unavailable",
		"missing-jwks",
		"missing-issuer",
	])("skips registration when discovery is %s", async (failure) => {
		server.use(
			http.get(`${issuer}/.well-known/openid-configuration`, () =>
				failure === "unavailable"
					? new HttpResponse(null, { status: 503 })
					: HttpResponse.json({
							...discovery,
							jwks_uri:
								failure === "missing-jwks" ? undefined : discovery.jwks_uri,
							issuer: failure === "missing-issuer" ? undefined : issuer,
						}),
			),
		);
		const { auth } = await getTestInstance({
			plugins: [genericOAuth({ config: [chatgpt({ clientId })] })],
		});
		expect(
			(await auth.$context).socialProviders.map((provider) => provider.id),
		).not.toContain("chatgpt");
	});

	it.each([
		"client_secret_basic",
		"client_secret_post",
	] as const)("fails initialization for %s without a secret", async (method) => {
		server.use(
			http.get(`${issuer}/.well-known/openid-configuration`, () =>
				HttpResponse.json(discovery),
			),
		);
		await expect(
			getTestInstance({
				plugins: [
					genericOAuth({
						config: [chatgpt({ clientId, tokenEndpointAuth: { method } })],
					}),
				],
			}),
		).rejects.toThrow("requires clientSecret");
	});
});

import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import type { GenericOAuthConfig } from "./types";

interface RecordedRequest {
	path: string;
	headers: IncomingMessage["headers"];
	body: URLSearchParams;
}

/**
 * Minimal authorization server for RFC 9126. It records every request,
 * redeems a code only for the PKCE challenge pushed with it, and can
 * advertise or require PAR in its metadata.
 */
async function startAuthorizationServer() {
	const requests: RecordedRequest[] = [];
	const metadata = {
		advertisePar: true,
		requirePar: true,
		parStatus: 201,
		parResponse: undefined as object | undefined,
	};
	let pushedChallenge: string | null = null;

	const server = createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		const path = new URL(req.url ?? "/", url).pathname;
		const body = new URLSearchParams(Buffer.concat(chunks).toString());
		requests.push({ path, headers: req.headers, body });

		const json = (status: number, payload: object) => {
			res.statusCode = status;
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify(payload));
		};

		if (path === "/.well-known/openid-configuration") {
			return json(200, {
				issuer: url,
				authorization_endpoint: `${url}/authorize`,
				token_endpoint: `${url}/token`,
				userinfo_endpoint: `${url}/userinfo`,
				...(metadata.advertisePar && {
					pushed_authorization_request_endpoint: `${url}/par`,
				}),
				...(metadata.requirePar && {
					require_pushed_authorization_requests: true,
				}),
			});
		}
		if (path === "/par") {
			pushedChallenge = body.get("code_challenge");
			return json(
				metadata.parStatus,
				metadata.parResponse ?? {
					request_uri: "urn:ietf:params:oauth:request_uri:pushed-1",
					expires_in: 60,
				},
			);
		}
		if (path === "/token") {
			const verifier = body.get("code_verifier") ?? "";
			const challenge = createHash("sha256")
				.update(verifier)
				.digest("base64url");
			if (body.get("code") !== "par-code" || challenge !== pushedChallenge) {
				return json(400, { error: "invalid_grant" });
			}
			return json(200, {
				access_token: "par-access-token",
				token_type: "Bearer",
				expires_in: 3600,
			});
		}
		if (path === "/userinfo") {
			return json(200, {
				id: "par-user",
				email: "par-user@example.com",
				name: "PAR User",
				email_verified: true,
			});
		}
		res.statusCode = 404;
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const url = `http://localhost:${(server.address() as AddressInfo).port}`;
	return {
		url,
		requests,
		metadata,
		pushed: () => requests.filter((r) => r.path === "/par"),
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((err) => (err ? reject(err) : resolve())),
			),
	};
}

describe("generic-oauth pushed authorization requests", async () => {
	const as = await startAuthorizationServer();

	afterEach(() => {
		as.requests.length = 0;
		Object.assign(as.metadata, {
			advertisePar: true,
			requirePar: true,
			parStatus: 201,
			parResponse: undefined,
		});
	});
	afterAll(async () => {
		await as.close();
	});

	async function createInstance(config: Partial<GenericOAuthConfig> = {}) {
		return getTestInstance(
			{
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "par",
								discoveryUrl: `${as.url}/.well-known/openid-configuration`,
								clientId: "par-client",
								clientSecret: "par-secret",
								...config,
							},
						],
					}),
				],
			},
			{ disableTestUser: true },
		);
	}

	async function signIn(instance: Awaited<ReturnType<typeof createInstance>>) {
		const headers = new Headers();
		const res = await instance.client.signIn.social({
			provider: "par",
			callbackURL: "/dashboard",
			fetchOptions: { onSuccess: instance.cookieSetter(headers) },
		});
		return { res, headers };
	}

	it("pushes the authorization request when discovery requires PAR", async () => {
		const instance = await createInstance();
		const { res, headers } = await signIn(instance);

		expect(res.error).toBeNull();
		const authorizationURL = new URL(res.data!.url!);
		expect(`${authorizationURL.origin}${authorizationURL.pathname}`).toBe(
			`${as.url}/authorize`,
		);
		expect([...authorizationURL.searchParams.keys()].sort()).toEqual([
			"client_id",
			"request_uri",
		]);
		expect(authorizationURL.searchParams.get("client_id")).toBe("par-client");
		expect(authorizationURL.searchParams.get("request_uri")).toBe(
			"urn:ietf:params:oauth:request_uri:pushed-1",
		);

		const [pushed] = as.pushed();
		expect(pushed).toBeDefined();
		expect(pushed!.headers["content-type"]).toBe(
			"application/x-www-form-urlencoded",
		);
		const body = pushed!.body;
		expect(body.get("response_type")).toBe("code");
		expect(body.get("client_id")).toBe("par-client");
		expect(body.get("client_secret")).toBe("par-secret");
		expect(body.get("redirect_uri")).toBe(
			"http://localhost:3000/api/auth/callback/par",
		);
		expect(body.get("code_challenge_method")).toBe("S256");
		expect(body.get("code_challenge")).toEqual(expect.any(String));
		const state = body.get("state");
		expect(state).toEqual(expect.any(String));

		// The authorization server redirects back with a code for the pushed request.
		const callback = await instance.auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/par?code=par-code&state=${state}`,
				{ headers },
			),
		);
		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe("/dashboard");
		expect(callback.headers.get("set-cookie")).toContain(
			"better-auth.session_token",
		);
	});

	it("keeps the front-channel request when discovery advertises but does not require PAR", async () => {
		as.metadata.requirePar = false;
		const instance = await createInstance();
		const { res } = await signIn(instance);

		const authorizationURL = new URL(res.data!.url!);
		expect(authorizationURL.searchParams.get("request_uri")).toBeNull();
		expect(authorizationURL.searchParams.get("state")).toEqual(
			expect.any(String),
		);
		expect(as.pushed()).toHaveLength(0);
	});

	it("pushes an advertised-but-optional request when pushedAuthorizationRequest is true", async () => {
		as.metadata.requirePar = false;
		const instance = await createInstance({ pushedAuthorizationRequest: true });
		const { res } = await signIn(instance);

		const authorizationURL = new URL(res.data!.url!);
		expect(authorizationURL.searchParams.get("request_uri")).toBe(
			"urn:ietf:params:oauth:request_uri:pushed-1",
		);
		expect(as.pushed()).toHaveLength(1);
	});

	it("does not push when pushedAuthorizationRequest is false", async () => {
		const instance = await createInstance({
			pushedAuthorizationRequest: false,
		});
		const { res } = await signIn(instance);

		expect(new URL(res.data!.url!).searchParams.get("request_uri")).toBeNull();
		expect(as.pushed()).toHaveLength(0);
	});

	it("authenticates the pushed request with the token endpoint client authentication", async () => {
		const getClientAssertion = vi.fn(async () => "client-assertion-jwt");
		const instance = await createInstance({
			clientSecret: undefined,
			tokenEndpointAuth: { method: "private_key_jwt", getClientAssertion },
		});
		const { res } = await signIn(instance);

		expect(res.error).toBeNull();
		const body = as.pushed()[0]!.body;
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion")).toBe("client-assertion-jwt");
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		// RFC 9126 §2: the server must accept its token endpoint URL as the audience.
		expect(getClientAssertion).toHaveBeenCalledWith({
			clientId: "par-client",
			tokenEndpoint: `${as.url}/token`,
			grantType: "authorization_code",
		});
	});

	it("sends client_secret_basic credentials in the Authorization header", async () => {
		const instance = await createInstance({
			tokenEndpointAuth: { method: "client_secret_basic" },
		});
		await signIn(instance);

		const pushed = as.pushed()[0]!;
		expect(pushed.headers.authorization).toBe(
			`Basic ${btoa("par-client:par-secret")}`,
		);
		expect(pushed.body.get("client_secret")).toBeNull();
	});

	it("pushes provider authorization parameters and the caller's additional parameters", async () => {
		const instance = await createInstance({
			scopes: ["profile"],
			prompt: "consent",
			authorizationUrlParams: { audience: "https://api.example.com" },
		});
		await instance.client.signIn.social({
			provider: "par",
			callbackURL: "/dashboard",
			additionalParams: { ui_locales: "es" },
		});

		const body = as.pushed()[0]!.body;
		expect(body.get("scope")).toBe("profile");
		expect(body.get("prompt")).toBe("consent");
		expect(body.get("audience")).toBe("https://api.example.com");
		expect(body.get("ui_locales")).toBe("es");
	});

	it("fails the sign-in without a redirect when the server rejects the pushed request", async () => {
		as.metadata.parStatus = 400;
		as.metadata.parResponse = {
			error: "invalid_request",
			error_description: "redirect_uri is not registered",
		};
		const instance = await createInstance();
		const { res } = await signIn(instance);

		expect(res.data).toBeNull();
		expect(res.error?.status).toBe(502);
		expect(res.error?.code).toBe("PUSHED_AUTHORIZATION_REQUEST_FAILED");
		expect(JSON.stringify(res.error)).not.toContain(
			"redirect_uri is not registered",
		);
	});

	it("fails the sign-in when the pushed request response has no request_uri", async () => {
		as.metadata.parResponse = { expires_in: 60 };
		const instance = await createInstance();
		const { res } = await signIn(instance);

		expect(res.data).toBeNull();
		expect(res.error?.code).toBe("PUSHED_AUTHORIZATION_REQUEST_FAILED");
	});

	it("uses a configured pushedAuthorizationRequestUrl without discovery", async () => {
		const instance = await createInstance({
			discoveryUrl: undefined,
			authorizationUrl: `${as.url}/authorize`,
			tokenUrl: `${as.url}/token`,
			userInfoUrl: `${as.url}/userinfo`,
			pushedAuthorizationRequestUrl: `${as.url}/par`,
			pushedAuthorizationRequest: true,
		});
		const { res } = await signIn(instance);

		expect(new URL(res.data!.url!).searchParams.get("request_uri")).toBe(
			"urn:ietf:params:oauth:request_uri:pushed-1",
		);
	});

	it("rejects pushedAuthorizationRequest: true without a pushed authorization request endpoint", async () => {
		await expect(
			getTestInstance({
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "par",
								authorizationUrl: `${as.url}/authorize`,
								tokenUrl: `${as.url}/token`,
								clientId: "par-client",
								clientSecret: "par-secret",
								pushedAuthorizationRequest: true,
							},
						],
					}),
				],
			}),
		).rejects.toThrow(/pushedAuthorizationRequestUrl/);
	});

	it("skips a discovered provider that requires PAR but advertises no endpoint", async () => {
		as.metadata.advertisePar = false;
		const instance = await createInstance();
		const { res } = await signIn(instance);

		expect(res.data).toBeNull();
		expect(as.pushed()).toHaveLength(0);
	});

	it("warns when PAR is disabled for a server that requires it", async () => {
		const log = vi.fn();
		const { auth } = await getTestInstance(
			{
				logger: { level: "warn", log },
				plugins: [
					genericOAuth({
						config: [
							{
								providerId: "par",
								discoveryUrl: `${as.url}/.well-known/openid-configuration`,
								clientId: "par-client",
								clientSecret: "par-secret",
								pushedAuthorizationRequest: false,
							},
						],
					}),
				],
			},
			{ disableTestUser: true },
		);
		const context = await auth.$context;

		expect(context.socialProviders.some((p) => p.id === "par")).toBe(true);
		expect(log).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining("require_pushed_authorization_requests"),
		);
	});
});

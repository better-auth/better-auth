import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type {
	OAuthBeforeAuthorizationInput,
	OAuthBeforeAuthorizationResult,
	OAuthProviderExtension,
} from "./types";
import type { OAuthClient } from "./types/oauth";

const baseURL = "http://localhost:3000";
const parEndpoint = `${baseURL}/api/auth/oauth2/par`;
const authorizeEndpoint = `${baseURL}/api/auth/oauth2/authorize`;
const redirectUri = "https://rp.example.com/callback";
const mfaAcr = "urn:example:acr:mfa";
const resolverRequestUri = "urn:example:app-hosted";

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthError
 */
describe("beforeAuthorization", async () => {
	type Policy = (
		input: OAuthBeforeAuthorizationInput,
	) => OAuthBeforeAuthorizationResult | undefined | Promise<undefined>;
	const calls: OAuthBeforeAuthorizationInput[] = [];
	const order: string[] = [];
	let policy: Policy = () => undefined;

	const extension: OAuthProviderExtension = {
		name: "test-policy-extension",
		beforeAuthorization: () => {
			order.push("extension");
		},
	};

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					pushedAuthorizationRequests: { enabled: true },
					requestUriResolver: async ({ requestUri }) =>
						requestUri === resolverRequestUri
							? await requestParams({ acr_values: mfaAcr })
							: null,
					authenticationContext: {
						acrValuesSupported: ["0", mfaAcr],
						resolve: () => undefined,
					},
					extensions: [extension],
					beforeAuthorization: (input) => {
						order.push("top-level");
						calls.push(input);
						return policy(input);
					},
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	let client: OAuthClient;
	beforeAll(async () => {
		client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
	});
	beforeEach(() => {
		calls.length = 0;
		order.length = 0;
		policy = () => undefined;
	});

	async function requestParams(extra: Record<string, string> = {}) {
		return {
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "openid",
			state: "policy-state",
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...extra,
		};
	}

	async function push(params: Record<string, string>) {
		const response = await customFetchImpl(parEndpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				...params,
				client_secret: client.client_secret!,
			}).toString(),
		});
		expect(response.status).toBe(201);
		return ((await response.json()) as { request_uri: string }).request_uri;
	}

	async function authorize(
		params: Record<string, string>,
		sessionHeaders: Headers = headers,
	) {
		const url = new URL(authorizeEndpoint);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		const response = await customFetchImpl(url.toString(), {
			headers: sessionHeaders,
			redirect: "manual",
		});
		return new URL(response.headers.get("Location") ?? "", baseURL);
	}

	async function signIn(login: URL) {
		const response = await customFetchImpl(
			`${baseURL}/api/auth/sign-in/email`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: "test@test.com",
					password: "test123456",
					oauth_query: login.searchParams.toString(),
				}),
			},
		);
		return new URL(((await response.json()) as { url: string }).url, baseURL);
	}

	async function countCodes() {
		const rows = await context.adapter.findMany<{ value: string }>({
			model: "verification",
		});
		return rows.filter((row) => row.value.includes('"authorization_code"'))
			.length;
	}

	it("sees a pushed request with pushed: true and without client credentials", async () => {
		const requestUri = await push(
			await requestParams({ acr_values: mfaAcr, custom_param: "kept" }),
		);
		const location = await authorize({
			client_id: client.client_id,
			request_uri: requestUri,
		});
		expect(location.searchParams.get("code")).toEqual(expect.any(String));
		expect(calls).toHaveLength(1);
		const [input] = calls;
		expect(input!.pushed).toBe(true);
		expect(input!.query.acr_values).toBe(mfaAcr);
		expect(input!.query).toMatchObject({ custom_param: "kept" });
		expect(input!.query).not.toHaveProperty("client_secret");
		expect(input!.query).not.toHaveProperty("request_uri");
		expect(input!.client.clientId).toBe(client.client_id);
		expect(input!.session?.user.email).toBe("test@test.com");
	});

	it("sees a request from requestUriResolver with pushed: false", async () => {
		const location = await authorize({
			client_id: client.client_id,
			request_uri: resolverRequestUri,
		});
		expect(location.searchParams.get("code")).toEqual(expect.any(String));
		expect(calls).toHaveLength(1);
		expect(calls[0]!.pushed).toBe(false);
		expect(calls[0]!.query.acr_values).toBe(mfaAcr);
		expect(calls[0]!.query).not.toHaveProperty("request_uri");
	});

	it("sees a direct request with pushed: false", async () => {
		const location = await authorize(
			await requestParams({ acr_values: mfaAcr }),
		);
		expect(location.searchParams.get("code")).toEqual(expect.any(String));
		expect(calls).toHaveLength(1);
		expect(calls[0]!.pushed).toBe(false);
		expect(calls[0]!.query.acr_values).toBe(mfaAcr);
	});

	it("runs before the login redirect for a request without a session", async () => {
		const location = await authorize(await requestParams(), new Headers());
		expect(location.pathname).toBe("/login");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.session).toBeNull();
	});

	it("runs extension hooks before the top-level hook", async () => {
		await authorize(await requestParams());
		expect(order).toEqual(["extension", "top-level"]);
	});

	it("forces sign-in with a live session, then runs again with the new one", async () => {
		const original = await auth.api.getSession({ headers });
		policy = ({ session }) =>
			session?.session.id === original!.session.id
				? { prompt: "login" }
				: undefined;
		const login = await authorize(await requestParams());
		expect(login.pathname).toBe("/login");
		expect(login.searchParams.get("prompt")).toBe("login");

		const continued = await signIn(login);
		expect(continued.searchParams.get("code")).toEqual(expect.any(String));
		expect(calls).toHaveLength(2);
		expect(calls[1]!.session?.session.id).not.toBe(original!.session.id);
	});

	it("answers prompt=none with login_required instead of forcing sign-in", async () => {
		policy = () => ({ prompt: "login" });
		const location = await authorize(await requestParams({ prompt: "none" }));
		expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
		expect(location.searchParams.get("error")).toBe("login_required");
		expect(location.searchParams.get("state")).toBe("policy-state");
	});

	it("delivers a thrown OAuth error to the client and consumes nothing", async () => {
		policy = () => {
			throw new APIError("BAD_REQUEST", {
				error: "interaction_required",
				error_description: "step-up required",
			});
		};
		const codesBefore = await countCodes();
		const requestUri = await push(await requestParams({ acr_values: mfaAcr }));
		const visit = () =>
			authorize({ client_id: client.client_id, request_uri: requestUri });

		const refused = await visit();
		expect(`${refused.origin}${refused.pathname}`).toBe(redirectUri);
		expect(refused.searchParams.get("error")).toBe("interaction_required");
		expect(refused.searchParams.get("error_description")).toBe(
			"step-up required",
		);
		expect(refused.searchParams.get("state")).toBe("policy-state");
		expect(refused.searchParams.get("iss")).toBe(baseURL);
		expect(await countCodes()).toBe(codesBefore);

		// The request_uri is still usable once the policy allows it.
		policy = () => undefined;
		const issued = await visit();
		expect(issued.searchParams.get("code")).toEqual(expect.any(String));
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1
	 */
	it("delivers the error in the query whatever response_mode asks", async () => {
		policy = () => {
			throw new APIError("BAD_REQUEST", { error: "access_denied" });
		};
		const location = await authorize(
			await requestParams({ response_mode: "fragment" }),
		);
		expect(location.hash).toBe("");
		expect(location.searchParams.get("error")).toBe("access_denied");
		expect(location.searchParams.get("state")).toBe("policy-state");
	});

	it("passes other APIErrors through unchanged", async () => {
		policy = () => {
			throw new APIError("FOUND", undefined, {
				Location: "https://app.example.com/step-up",
			});
		};
		const location = await authorize(await requestParams());
		expect(location.toString()).toBe("https://app.example.com/step-up");
	});
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthError
 */
describe("beforeAuthorization with issueAuthorizationCode", async () => {
	const { createAuthEndpoint, sessionMiddleware } = await import(
		"better-auth/api"
	);
	const { getOAuthProviderApi } = await import("./token");
	let policy: (
		input: OAuthBeforeAuthorizationInput,
	) => OAuthBeforeAuthorizationResult | undefined = () => undefined;
	const issuer = {
		id: "test-policy-code-issuer",
		endpoints: {
			testSignInAndIssueCode: createAuthEndpoint(
				"/test/sign-in-and-issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					// Stands in for an endpoint that checks a password and signs the
					// user in within the request that issues the code.
					const session = await ctx.context.internalAdapter.createSession(
						ctx.context.session.user.id,
					);
					const issued = await getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					).issueAuthorizationCode({
						query: ctx.body as Record<string, string>,
						session: { session, user: ctx.context.session.user },
					});
					return ctx.json({ code: issued.code });
				},
			),
			testIssueCode: createAuthEndpoint(
				"/test/issue-code",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const issued = await getOAuthProviderApi(
						ctx,
						ctx.context.getPlugin("oauth-provider")!.options,
					).issueAuthorizationCode({
						query: ctx.body as Record<string, string>,
						session: ctx.context.session,
					});
					return ctx.json({ code: issued.code });
				},
			),
		},
	};
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: `${baseURL}/api/auth/`,
		advanced: { skipTrailingSlashes: true },
		plugins: [
			issuer,
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				beforeAuthorization: (input) => policy(input),
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	let oauthClient: OAuthClient;
	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				application_type: "native",
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
	});

	async function issue(path = "/test/issue-code") {
		return client.$fetch<{ code: string }>(path, {
			method: "POST",
			headers,
			body: {
				response_type: "code",
				client_id: oauthClient.client_id,
				scope: "openid",
				code_challenge: await generateCodeChallenge(generateRandomString(43)),
				code_challenge_method: "S256",
			},
		});
	}

	it("runs the policy with pushed: false", async () => {
		const seen: OAuthBeforeAuthorizationInput[] = [];
		policy = (input) => {
			seen.push(input);
			return undefined;
		};
		const issued = await issue();
		expect(issued.error).toBeNull();
		expect(seen).toHaveLength(1);
		expect(seen[0]!.pushed).toBe(false);
		expect(seen[0]!.session?.user.email).toBe("test@test.com");
	});

	it("throws the policy's OAuth error", async () => {
		policy = () => {
			throw new APIError("BAD_REQUEST", { error: "access_denied" });
		};
		const issued = await issue();
		expect(issued.error?.status).toBe(400);
		expect((issued.error as { error?: string }).error).toBe("access_denied");
	});

	it("answers a forced sign-in with login_required for an earlier session", async () => {
		policy = () => ({ prompt: "login" });
		const issued = await issue();
		expect(issued.error?.status).toBe(400);
		expect((issued.error as { error?: string }).error).toBe("login_required");
	});

	it("answers a forced sign-in with login_required for a session created in the same request", async () => {
		policy = () => ({ prompt: "login" });
		const issued = await issue("/test/sign-in-and-issue-code");
		expect(issued.error?.status).toBe(400);
		expect((issued.error as { error?: string }).error).toBe("login_required");
	});

	it("passes the policy the max_age and prompt the client sent", async () => {
		const seen: OAuthBeforeAuthorizationInput["query"][] = [];
		policy = (input) => {
			seen.push(input.query);
			return undefined;
		};
		const issued = await client.$fetch<{ code: string }>(
			"/test/sign-in-and-issue-code",
			{
				method: "POST",
				headers,
				body: {
					response_type: "code",
					client_id: oauthClient.client_id,
					scope: "openid",
					max_age: "300",
					prompt: "login",
					code_challenge: await generateCodeChallenge(generateRandomString(43)),
					code_challenge_method: "S256",
				},
			},
		);
		expect(issued.error).toBeNull();
		expect(seen).toHaveLength(1);
		expect(seen[0]!.max_age).toBe(300);
		expect(seen[0]!.prompt).toBe("login");
	});
});

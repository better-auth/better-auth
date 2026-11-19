import {
	CLIENT_ASSERTION_TYPE,
	signPrivateKeyJwtClientAssertion,
} from "@better-auth/core/oauth2";
import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cimd } from "./index";
import type { CimdOptions } from "./types";

const baseURL = "http://localhost:3000";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const PKCE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const PKCE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const ORIGIN_ERROR_DESCRIPTION =
	"jwks_uri must belong to a trusted origin or the Client ID Metadata Document origin";

type IsCrossOriginJwksUriAllowed = NonNullable<
	CimdOptions["isCrossOriginJwksUriAllowed"]
>;

function requestUrl(input: RequestInfo | URL): string {
	return typeof input === "string"
		? input
		: input instanceof URL
			? input.href
			: input.url;
}

async function createKeyPair(kid: string) {
	const { privateKey, publicKey } = (await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;
	return {
		kid,
		privateKeyJwk: await crypto.subtle.exportKey("jwk", privateKey),
		jwks: {
			keys: [
				{
					...(await crypto.subtle.exportKey("jwk", publicKey)),
					kid,
					alg: "ES256",
					use: "sig",
				},
			],
		},
	};
}

async function createServer(
	options: Pick<CimdOptions, "isCrossOriginJwksUriAllowed">,
) {
	const resources = new Map<string, unknown>();
	const fetchClientMetadataResource = vi.fn(
		async (input: RequestInfo | URL) => {
			const resource = resources.get(requestUrl(input));
			return resource === undefined
				? new Response(null, { status: 404 })
				: Response.json(resource);
		},
	);
	const instance = await getTestInstance({
		baseURL,
		trustedOrigins: ["https://trusted-keys.example"],
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access"],
			}),
			cimd({ fetchClientMetadataResource, ...options }),
		],
	});
	const { headers } = await instance.signInWithTestUser();

	/** Serves a private_key_jwt metadata document whose keys live at `jwksUri`. */
	function publishClient(name: string, jwksUri: string, jwks?: unknown) {
		const clientId = `https://client.example/${name}/client.json`;
		const redirectUri = `https://client.example/${name}/callback`;
		resources.set(clientId, {
			client_id: clientId,
			client_name: `${name} client`,
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			grant_types: ["authorization_code"],
			response_types: ["code"],
			jwks_uri: jwksUri,
		});
		if (jwks !== undefined) resources.set(jwksUri, jwks);
		return { clientId, redirectUri };
	}

	async function authorize(clientId: string, redirectUri: string) {
		const url = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		url.search = new URLSearchParams({
			client_id: clientId,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "openid",
			state: "state",
			code_challenge: PKCE_CHALLENGE,
			code_challenge_method: "S256",
		}).toString();
		const response = await instance.auth.handler(new Request(url, { headers }));
		const location = response.headers.get("location");
		return {
			status: response.status,
			location: location ? new URL(location, baseURL) : undefined,
			body: location
				? undefined
				: ((await response.json()) as Record<string, unknown>),
		};
	}

	async function findClient(clientId: string) {
		const context = await instance.auth.$context;
		return context.adapter.findOne<{ jwksUri?: string | null }>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
	}

	async function exchangeCode(input: {
		clientId: string;
		redirectUri: string;
		key: Awaited<ReturnType<typeof createKeyPair>>;
	}) {
		const context = await instance.auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: input.clientId }],
			update: { skipConsent: true },
		});
		const callback = await authorize(input.clientId, input.redirectUri);
		const code = callback.location?.searchParams.get("code");
		expect(code, JSON.stringify(callback)).toEqual(expect.any(String));
		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId: input.clientId,
			tokenEndpoint,
			privateKeyJwk: input.key.privateKeyJwk,
			kid: input.key.kid,
			algorithm: "ES256",
		});
		const response = await instance.auth.handler(
			new Request(tokenEndpoint, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code: code ?? "",
					redirect_uri: input.redirectUri,
					client_id: input.clientId,
					client_assertion_type: CLIENT_ASSERTION_TYPE,
					client_assertion: assertion,
					code_verifier: PKCE_VERIFIER,
				}),
			}),
		);
		return {
			status: response.status,
			body: (await response.json()) as Record<string, unknown>,
		};
	}

	return {
		fetchClientMetadataResource,
		publishClient,
		authorize,
		findClient,
		exchangeCode,
	};
}

type AuthorizeResult = Awaited<
	ReturnType<Awaited<ReturnType<typeof createServer>>["authorize"]>
>;

function expectConsentRedirect(result: AuthorizeResult) {
	expect(result.location?.pathname, JSON.stringify(result.body)).toBe(
		"/consent",
	);
}

function expectRegistrationRefused(
	result: AuthorizeResult,
	errorDescription: string,
) {
	expect(result.status).toBe(400);
	expect(result.body).toEqual({
		error: "invalid_client_metadata",
		error_description: errorDescription,
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11916
 */
describe("cross-origin jwks_uri", () => {
	describe("without isCrossOriginJwksUriAllowed", async () => {
		const server = await createServer({});

		it("rejects a jwks_uri on another origin with the existing error", async () => {
			const { clientId, redirectUri } = server.publishClient(
				"default",
				"https://keys.example/default/jwks.json",
			);

			expectRegistrationRefused(
				await server.authorize(clientId, redirectUri),
				ORIGIN_ERROR_DESCRIPTION,
			);
			expect(await server.findClient(clientId)).toBeNull();
		});
	});

	describe("with isCrossOriginJwksUriAllowed", async () => {
		const isCrossOriginJwksUriAllowed = vi.fn<IsCrossOriginJwksUriAllowed>(
			() => false,
		);
		const server = await createServer({ isCrossOriginJwksUriAllowed });

		afterEach(() => {
			isCrossOriginJwksUriAllowed.mockReset();
			isCrossOriginJwksUriAllowed.mockImplementation(() => false);
			server.fetchClientMetadataResource.mockClear();
		});

		it("registers the client and accepts an assertion signed with the cross-origin key", async () => {
			const key = await createKeyPair("allowed-key");
			const jwksUri = "https://keys.example/allowed/jwks.json";
			const { clientId, redirectUri } = server.publishClient(
				"allowed",
				jwksUri,
				key.jwks,
			);
			isCrossOriginJwksUriAllowed.mockImplementation(
				({ clientId: candidateClientId, jwksUri: candidateJwksUri }) =>
					new URL(candidateClientId).origin === "https://client.example" &&
					new URL(candidateJwksUri).origin === "https://keys.example",
			);

			expectConsentRedirect(await server.authorize(clientId, redirectUri));
			expect(await server.findClient(clientId)).toMatchObject({ jwksUri });

			const token = await server.exchangeCode({ clientId, redirectUri, key });
			expect(token.status, JSON.stringify(token.body)).toBe(200);
			expect(token.body.access_token).toEqual(expect.any(String));
			expect(
				server.fetchClientMetadataResource.mock.calls.map(([input]) =>
					requestUrl(input),
				),
			).toContain(jwksUri);
		});

		it("passes the client_id, jwks_uri, and endpoint context", async () => {
			const jwksUri = "https://keys.example/arguments/jwks.json";
			const { clientId, redirectUri } = server.publishClient(
				"arguments",
				jwksUri,
			);

			await server.authorize(clientId, redirectUri);

			expect(isCrossOriginJwksUriAllowed).toHaveBeenCalledWith(
				{ clientId, jwksUri },
				expect.objectContaining({
					path: "/oauth2/authorize",
					context: expect.objectContaining({ baseURL: `${baseURL}/api/auth` }),
				}),
			);
		});

		it.each([
			["returns false", () => false],
			[
				"throws",
				() => {
					throw new Error("policy unavailable");
				},
			],
			["rejects", () => Promise.reject(new Error("policy unavailable"))],
			["resolves a truthy non-boolean", () => "yes" as unknown as boolean],
		] satisfies [string, IsCrossOriginJwksUriAllowed][])(
			"refuses the client with the existing error when the predicate %s",
			async (name, implementation) => {
				const slug = name.replaceAll(" ", "-");
				const { clientId, redirectUri } = server.publishClient(
					slug,
					`https://keys.example/${slug}/jwks.json`,
				);
				isCrossOriginJwksUriAllowed.mockImplementation(implementation);

				expectRegistrationRefused(
					await server.authorize(clientId, redirectUri),
					ORIGIN_ERROR_DESCRIPTION,
				);
				expect(isCrossOriginJwksUriAllowed).toHaveBeenCalled();
				expect(await server.findClient(clientId)).toBeNull();
			},
		);

		it("is not consulted for a jwks_uri on the client_id origin or a trusted origin", async () => {
			const sameOrigin = server.publishClient(
				"same-origin",
				"https://client.example/same-origin/jwks.json",
			);
			const trusted = server.publishClient(
				"trusted",
				"https://trusted-keys.example/jwks.json",
			);

			expectConsentRedirect(
				await server.authorize(sameOrigin.clientId, sameOrigin.redirectUri),
			);
			expectConsentRedirect(
				await server.authorize(trusted.clientId, trusted.redirectUri),
			);
			expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
		});

		it("still refuses a private-host jwks_uri when the predicate allows it", async () => {
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);
			const { clientId, redirectUri } = server.publishClient(
				"private-host",
				"https://169.254.169.254/jwks.json",
			);

			expectRegistrationRefused(
				await server.authorize(clientId, redirectUri),
				"jwks_uri must not point to a private or reserved address",
			);
			expect(isCrossOriginJwksUriAllowed).not.toHaveBeenCalled();
			expect(await server.findClient(clientId)).toBeNull();
		});

		it("is consulted again when the stored client authenticates", async () => {
			const key = await createKeyPair("revoked-key");
			const jwksUri = "https://keys.example/revoked/jwks.json";
			const { clientId, redirectUri } = server.publishClient(
				"revoked",
				jwksUri,
				key.jwks,
			);
			isCrossOriginJwksUriAllowed.mockImplementation(() => true);
			expectConsentRedirect(await server.authorize(clientId, redirectUri));

			// The document stays fresh, so the token request re-validates the
			// stored client rather than registering it again.
			isCrossOriginJwksUriAllowed.mockImplementation(
				(_input, context) => context.path !== "/oauth2/token",
			);
			const token = await server.exchangeCode({ clientId, redirectUri, key });

			expect(token.status).toBe(400);
			expect(token.body).toEqual({
				error: "invalid_client",
				error_description: "client jwks_uri is not trusted",
			});
			expect(isCrossOriginJwksUriAllowed).toHaveBeenLastCalledWith(
				{ clientId, jwksUri },
				expect.objectContaining({ path: "/oauth2/token" }),
			);
			expect(
				server.fetchClientMetadataResource.mock.calls.map(([input]) =>
					requestUrl(input),
				),
			).not.toContain(jwksUri);
		});
	});
});

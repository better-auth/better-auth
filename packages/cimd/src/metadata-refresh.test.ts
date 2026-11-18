import {
	CLIENT_ASSERTION_TYPE,
	signPrivateKeyJwtClientAssertion,
} from "@better-auth/core/oauth2";
import type { SchemaClient, Scope } from "@better-auth/oauth-provider";
import { oauthProvider } from "@better-auth/oauth-provider";
import { parseSetCookieHeader } from "better-auth/cookies";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { cimd } from "./index";

const baseURL = "http://localhost:3000";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;

interface SigningKey {
	kid: string;
	privateKeyJwk: JsonWebKey;
	publicJwk: Record<string, unknown>;
}

async function generateSigningKey(kid: string): Promise<SigningKey> {
	const { privateKey, publicKey } = (await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;
	return {
		kid,
		privateKeyJwk: await crypto.subtle.exportKey("jwk", privateKey),
		publicJwk: {
			...(await crypto.subtle.exportKey("jwk", publicKey)),
			kid,
			alg: "ES256",
			use: "sig",
		},
	};
}

function requestUrl(input: RequestInfo | URL): string {
	return typeof input === "string"
		? input
		: input instanceof URL
			? input.href
			: input.url;
}

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-6
 */
describe("CIMD - refresh stores what the current document lists", async () => {
	const documents = new Map<string, unknown>();
	const fetchClientMetadataResource = vi.fn(
		async (input: RequestInfo | URL) => {
			const url = requestUrl(input);
			return documents.has(url)
				? Response.json(documents.get(url))
				: new Response(null, { status: 404 });
		},
	);
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "service:read"],
				pairwiseSecret: "metadata-refresh-pairwise-secret-0123456789",
			}),
			cimd({
				metadataRevalidationInterval: 0,
				metadataFetchPolicy: { minimumFetchInterval: 0 },
				fetchClientMetadataResource,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	const readClient = (clientId: string) =>
		context.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});

	const setServerFields = (
		clientId: string,
		update: Partial<SchemaClient<Scope[]>>,
	) =>
		context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update,
		});

	// Every lookup re-fetches the document because revalidation is immediate.
	const resolveClient = (clientId: string) =>
		auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers });

	const documentFetchCount = (clientId: string) =>
		fetchClientMetadataResource.mock.calls.filter(
			([input]) => requestUrl(input) === clientId,
		).length;

	async function confirmedLogoutLocation(
		clientId: string,
		postLogoutRedirectUri: string,
	): Promise<string | null> {
		const endSession = new URL(`${baseURL}/api/auth/oauth2/end-session`);
		endSession.searchParams.set("client_id", clientId);
		endSession.searchParams.set(
			"post_logout_redirect_uri",
			postLogoutRedirectUri,
		);
		const prompt = await auth.handler(
			new Request(endSession, { headers: { accept: "text/html" } }),
		);
		expect(prompt.status).toBe(200);
		const cookie = Array.from(
			parseSetCookieHeader(prompt.headers.get("set-cookie") ?? "").entries(),
		)
			.map(([name, { value }]) => `${name}=${value}`)
			.join("; ");
		const confirmed = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/end-session/confirm`, {
				method: "POST",
				headers: {
					accept: "text/html",
					"content-type": "application/x-www-form-urlencoded",
					cookie,
					origin: baseURL,
				},
				body: new URLSearchParams({ action: "confirm" }),
			}),
		);
		return confirmed.headers.get("location");
	}

	async function requestClientCredentialsToken(
		clientId: string,
		key: SigningKey,
	): Promise<Response> {
		const assertion = await signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: key.privateKeyJwk,
			kid: key.kid,
			algorithm: "ES256",
		});
		return auth.handler(
			new Request(tokenEndpoint, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: clientId,
					client_assertion_type: CLIENT_ASSERTION_TYPE,
					client_assertion: assertion,
				}),
			}),
		);
	}

	function fullDocument(clientId: string, key: SigningKey) {
		const origin = new URL(clientId).origin;
		return {
			client_id: clientId,
			client_name: "Full Client",
			client_uri: `${origin}/about`,
			logo_uri: `${origin}/logo.png`,
			tos_uri: `${origin}/tos`,
			policy_uri: `${origin}/policy`,
			contacts: ["owner@full-client.example.com"],
			software_id: "full-client",
			software_version: "1.0.0",
			software_statement: "header.payload.signature",
			redirect_uris: [`${origin}/callback`],
			post_logout_redirect_uris: [`${origin}/signed-out`],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: { keys: [key.publicJwk] },
			dpop_bound_access_tokens: true,
			subject_type: "pairwise",
		};
	}

	it("refuses a post-logout redirect URI the refreshed document removed", async () => {
		const clientId = "https://logout-client.example.com/client-metadata.json";
		const signedOut = "https://logout-client.example.com/signed-out";
		const document = {
			client_id: clientId,
			client_name: "Logout Client",
			redirect_uris: ["https://logout-client.example.com/callback"],
			token_endpoint_auth_method: "none",
		};
		documents.set(clientId, {
			...document,
			post_logout_redirect_uris: [signedOut],
		});
		await resolveClient(clientId);
		await setServerFields(clientId, { enableEndSession: true });
		expect(await confirmedLogoutLocation(clientId, signedOut)).toBe(signedOut);

		documents.set(clientId, document);
		expect(await confirmedLogoutLocation(clientId, signedOut)).toBeNull();
		expect((await readClient(clientId))?.postLogoutRedirectUris ?? []).toEqual(
			[],
		);
	});

	it("authenticates only with the jwks_uri keys after the document moves its keys there", async () => {
		const clientId = "https://key-client.example.com/client-metadata.json";
		const jwksUri = "https://key-client.example.com/jwks.json";
		const removedKey = await generateSigningKey("removed-inline-key");
		const currentKey = await generateSigningKey("current-remote-key");
		const document = {
			client_id: clientId,
			client_name: "Key Rotation Client",
			redirect_uris: ["https://key-client.example.com/callback"],
			token_endpoint_auth_method: "private_key_jwt",
			grant_types: ["authorization_code", "client_credentials"],
			response_types: ["code"],
		};
		documents.set(clientId, {
			...document,
			jwks: { keys: [removedKey.publicJwk] },
		});
		documents.set(jwksUri, { keys: [currentKey.publicJwk] });
		await resolveClient(clientId);
		await setServerFields(clientId, {
			clientCredentialsScopes: ["service:read"],
		});
		expect(
			(await requestClientCredentialsToken(clientId, removedKey)).status,
		).toBe(200);

		documents.set(clientId, { ...document, jwks_uri: jwksUri });
		const removedKeyResponse = await requestClientCredentialsToken(
			clientId,
			removedKey,
		);
		expect(await removedKeyResponse.json()).toMatchObject({
			error: "invalid_client",
		});
		expect(removedKeyResponse.status).toBe(401);
		expect(
			(await requestClientCredentialsToken(clientId, currentKey)).status,
		).toBe(200);
		const stored = await readClient(clientId);
		expect(stored?.jwks ?? null).toBeNull();
		expect(stored?.jwksUri).toBe(jwksUri);
	});

	it("keeps the stored subject type when a refreshed document omits subject_type", async () => {
		const clientId = "https://pairwise-client.example.com/client-metadata.json";
		const document = {
			client_id: clientId,
			client_name: "Pairwise Client",
			redirect_uris: ["https://pairwise-client.example.com/callback"],
			token_endpoint_auth_method: "none",
		};
		documents.set(clientId, { ...document, subject_type: "pairwise" });
		await resolveClient(clientId);
		expect((await readClient(clientId))?.subjectType).toBe("pairwise");

		documents.set(clientId, document);
		await resolveClient(clientId);
		expect((await readClient(clientId))?.subjectType).toBe("pairwise");
	});

	it("writes the same values when the refreshed document still lists every field", async () => {
		const clientId = "https://full-client.example.com/client-metadata.json";
		documents.set(
			clientId,
			fullDocument(clientId, await generateSigningKey("full-client-key")),
		);
		await resolveClient(clientId);
		const before = await readClient(clientId);
		const fetchesBefore = documentFetchCount(clientId);

		await resolveClient(clientId);
		expect(documentFetchCount(clientId)).toBe(fetchesBefore + 1);
		expect(await readClient(clientId)).toEqual({
			...before,
			updatedAt: expect.any(Date),
		});
		expect(before).toMatchObject({
			name: "Full Client",
			uri: "https://full-client.example.com/about",
			icon: "https://full-client.example.com/logo.png",
			tos: "https://full-client.example.com/tos",
			policy: "https://full-client.example.com/policy",
			contacts: ["owner@full-client.example.com"],
			softwareId: "full-client",
			softwareVersion: "1.0.0",
			softwareStatement: "header.payload.signature",
			postLogoutRedirectUris: ["https://full-client.example.com/signed-out"],
			jwks: expect.any(String),
			dpopBoundAccessTokens: true,
			subjectType: "pairwise",
		});
	});

	it("clears every document-owned field a refreshed document omits", async () => {
		const clientId = "https://bare-client.example.com/client-metadata.json";
		documents.set(
			clientId,
			fullDocument(clientId, await generateSigningKey("bare-client-key")),
		);
		await resolveClient(clientId);

		documents.set(clientId, {
			client_id: clientId,
			redirect_uris: ["https://bare-client.example.com/callback"],
			token_endpoint_auth_method: "none",
		});
		await resolveClient(clientId);
		const refreshed = await readClient(clientId);
		for (const field of [
			"name",
			"uri",
			"icon",
			"tos",
			"policy",
			"softwareId",
			"softwareVersion",
			"softwareStatement",
			"jwks",
			"jwksUri",
			"dpopBoundAccessTokens",
		] as const) {
			expect(refreshed?.[field] ?? null, field).toBeNull();
		}
		expect(refreshed?.contacts ?? []).toEqual([]);
		expect(refreshed?.postLogoutRedirectUris ?? []).toEqual([]);
		expect(refreshed?.subjectType).toBe("pairwise");
	});
});

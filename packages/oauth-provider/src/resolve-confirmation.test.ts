import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { describe, expect, it } from "vitest";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";
import { createDpopKey, createDpopProof } from "./test-utils/dpop";
import type { Confirmation } from "./types/oauth";

const tokenEndpoint = "http://localhost:3000/api/auth/oauth2/token";
const boundGrant = "urn:better-auth:test:bound-grant";

/**
 * A companion grant that keeps an existing binding: the test chooses the
 * expected key and the client-authentication confirmation through the body.
 */
const boundGrantPlugin = {
	id: "test-bound-grant",
	init(ctx) {
		extendOAuthProvider(ctx, {
			grants: {
				[boundGrant]: async ({ ctx, provider }) => {
					const body = ctx.body as Record<string, string | undefined>;
					const { client } = await provider.authenticateClient();
					const authConfirmation: Confirmation | undefined =
						body.confirmation_jkt
							? { jkt: body.confirmation_jkt }
							: body.confirmation_x5t
								? { "x5t#S256": body.confirmation_x5t }
								: undefined;
					const confirmation = await provider.resolveConfirmation({
						client,
						scopes: [],
						confirmation: authConfirmation,
						expectedJkt: body.expected_jkt,
					});
					return provider.issueTokens({ client, scopes: [], confirmation });
				},
			},
		});
	},
} satisfies BetterAuthPlugin;

describe("resolveConfirmation with expectedJkt", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [
			boundGrantPlugin,
			jwt(),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
		],
	});
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [boundGrant],
			application_type: "web",
		},
	});
	const boundKey = await createDpopKey();
	const otherKey = await createDpopKey();

	async function requestTokens(
		params: Record<string, string>,
		dpopProof?: string,
	) {
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: new URLSearchParams({
				grant_type: boundGrant,
				client_id: oauthClient!.client_id,
				client_secret: oauthClient!.client_secret!,
				...params,
			}).toString(),
		});
		return {
			status: response.status,
			body: (await response.json()) as Record<string, string | undefined>,
		};
	}

	it("binds the tokens to the expected key when the proof uses it", async () => {
		const result = await requestTokens(
			{ expected_jkt: boundKey.jkt },
			await createDpopProof(boundKey, { url: tokenEndpoint }),
		);
		expect(result.status).toBe(200);
		expect(result.body.token_type).toBe("DPoP");
	});

	it("rejects a proof signed with a different key", async () => {
		const result = await requestTokens(
			{ expected_jkt: boundKey.jkt },
			await createDpopProof(otherKey, { url: tokenEndpoint }),
		);
		expect(result.status).toBe(400);
		expect(result.body.error).toBe("invalid_dpop_proof");
	});

	it("requires a proof when a key is expected", async () => {
		const result = await requestTokens({ expected_jkt: boundKey.jkt });
		expect(result.status).toBe(400);
		expect(result.body.error).toBe("invalid_dpop_proof");
		expect(result.body.error_description).toBe("DPoP proof header is required");
	});

	it("accepts a client-authentication confirmation with the expected key", async () => {
		const result = await requestTokens({
			expected_jkt: boundKey.jkt,
			confirmation_jkt: boundKey.jkt,
		});
		expect(result.status).toBe(200);
		expect(result.body.token_type).toBe("DPoP");
	});

	it("rejects a client-authentication confirmation with a different key", async () => {
		const result = await requestTokens(
			{ expected_jkt: boundKey.jkt, confirmation_jkt: otherKey.jkt },
			await createDpopProof(boundKey, { url: tokenEndpoint }),
		);
		expect(result.status).toBe(400);
		expect(result.body.error).toBe("invalid_dpop_proof");
		expect(result.body.error_description).toBe(
			"Client authentication confirmation does not match the bound token",
		);
	});

	it("rejects a client-authentication confirmation without a DPoP key", async () => {
		const result = await requestTokens({
			expected_jkt: boundKey.jkt,
			confirmation_x5t: "client-certificate-thumbprint",
		});
		expect(result.status).toBe(400);
		expect(result.body.error).toBe("invalid_dpop_proof");
	});

	it("keeps issuing bearer tokens when no key is expected and no proof is sent", async () => {
		const result = await requestTokens({});
		expect(result.status).toBe(200);
		expect(result.body.token_type).toBe("Bearer");
	});
});

import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";
import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import { generateRandomString } from "../../crypto";

const ISSUED_NONCE_EXPIRES_IN_MS = 5 * 60 * 1000;
const ISSUED_NONCE_LENGTH = 32;
const ISSUED_NONCE_PATTERN = new RegExp(
	`^[a-zA-Z0-9]{${ISSUED_NONCE_LENGTH}}$`,
);

/**
 * Store a new single-use nonce under `scope` and return it. It expires after
 * five minutes.
 */
export async function issueNonce(ctx: GenericEndpointContext, scope: string) {
	const nonce = generateRandomString(ISSUED_NONCE_LENGTH, "a-z", "A-Z", "0-9");
	await ctx.context.internalAdapter.createVerificationValue({
		identifier: `${scope}:${nonce}`,
		value: scope,
		expiresAt: new Date(Date.now() + ISSUED_NONCE_EXPIRES_IN_MS),
	});
	return nonce;
}

/**
 * Consume a nonce that {@link issueNonce} stored under `scope`. Throws
 * `INVALID_ID_TOKEN_NONCE` when it is missing, malformed, unknown, expired, or
 * already used. Call it before verifying the token, so a failed attempt burns
 * the nonce too.
 */
export async function consumeNonce(
	ctx: GenericEndpointContext,
	scope: string,
	nonce: string | undefined,
) {
	const issued =
		nonce && ISSUED_NONCE_PATTERN.test(nonce)
			? await ctx.context.internalAdapter.consumeVerificationValue(
					`${scope}:${nonce}`,
				)
			: null;
	if (!issued) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_ID_TOKEN_NONCE);
	}
}

/** OpenAPI responses for an endpoint that returns `{ nonce }` from {@link issueNonce}. */
export const issuedNonceResponses = {
	200: {
		description: "Success",
		content: {
			"application/json": {
				schema: {
					type: "object" as const,
					properties: {
						nonce: { type: "string" as const },
					},
					required: ["nonce"],
				},
			},
		},
	},
};

type ProviderWithOptions = Pick<OAuthProvider, "id" | "options">;

const idTokenNonceScope = (providerId: string) =>
	`id-token-nonce:${providerId}`;

const requiresIssuedNonce = (provider: ProviderWithOptions) =>
	provider.options?.requireIssuedIdTokenNonce === true;

/**
 * Consume the issued nonce presented with a client-submitted ID token, from
 * `/sign-in/social` or `/link-social`. A no-op for providers without
 * `requireIssuedIdTokenNonce`.
 */
export async function consumeIssuedIdTokenNonce(
	ctx: GenericEndpointContext,
	provider: ProviderWithOptions,
	nonce: string | undefined,
) {
	if (!requiresIssuedNonce(provider)) return;
	await consumeNonce(ctx, idTokenNonceScope(provider.id), nonce);
}

/**
 * ### Endpoint
 *
 * POST `/id-token/nonce`
 *
 * Issues a single-use nonce for a client to pass to the provider's SDK before
 * submitting the resulting ID token to `/sign-in/social` or `/link-social`.
 * Only available for providers that set `requireIssuedIdTokenNonce`.
 */
export const issueIdTokenNonce = createAuthEndpoint(
	"/id-token/nonce",
	{
		method: "POST",
		body: z.object({
			provider: SocialProviderListEnum,
		}),
		metadata: {
			noStore: true,
			openapi: {
				description:
					"Issue a single-use nonce to bind a provider ID token to one sign-in or account-linking request",
				responses: issuedNonceResponses,
			},
		},
	},
	async (ctx) => {
		const provider = await getAwaitableValue(ctx.context.socialProviders, {
			value: ctx.body.provider,
		});
		if (!provider) {
			throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
		}
		if (!requiresIssuedNonce(provider)) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.ID_TOKEN_NONCE_NOT_ENABLED,
			);
		}
		const nonce = await issueNonce(ctx, idTokenNonceScope(provider.id));
		return ctx.json({ nonce });
	},
);

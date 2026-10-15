import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import { supportsIdTokenSignIn } from "@better-auth/core/oauth2";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";
import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import { generateRandomString } from "../../crypto";

const ID_TOKEN_NONCE_EXPIRES_IN_MS = 5 * 60 * 1000;

type ProviderWithOptions = Pick<OAuthProvider, "id" | "idToken" | "options">;

const nonceIdentifier = (providerId: string, nonce: string) =>
	`id-token-nonce:${providerId}:${nonce}`;

const requiresIssuedNonce = (provider: ProviderWithOptions) =>
	provider.options?.requireIssuedIdTokenNonce === true;

/**
 * Consume the issued nonce presented with a client-submitted ID token. A no-op
 * for providers without `requireIssuedIdTokenNonce`. The nonce is burned before
 * the token is verified, so a failed attempt cannot be retried with it.
 */
export async function consumeIssuedIdTokenNonce(
	ctx: GenericEndpointContext,
	provider: ProviderWithOptions,
	nonce: string | undefined,
) {
	if (!requiresIssuedNonce(provider)) return;
	const issued = nonce
		? await ctx.context.internalAdapter.consumeVerificationValue(
				nonceIdentifier(provider.id, nonce),
			)
		: null;
	if (!issued) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_ID_TOKEN_NONCE);
	}
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
			openapi: {
				description:
					"Issue a single-use nonce to bind a provider ID token to one sign-in or account-linking request",
				responses: {
					200: {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										nonce: { type: "string" },
									},
									required: ["nonce"],
								},
							},
						},
					},
				},
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
		if (!requiresIssuedNonce(provider) || !supportsIdTokenSignIn(provider)) {
			throw APIError.from(
				"BAD_REQUEST",
				BASE_ERROR_CODES.ID_TOKEN_NONCE_NOT_ENABLED,
			);
		}
		const nonce = generateRandomString(32, "a-z", "A-Z", "0-9");
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: nonceIdentifier(provider.id, nonce),
			value: provider.id,
			expiresAt: new Date(Date.now() + ID_TOKEN_NONCE_EXPIRES_IN_MS),
		});
		return ctx.json({ nonce });
	},
);

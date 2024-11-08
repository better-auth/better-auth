import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../api";
import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	User,
} from "../../types";
import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../../utils";
import { handleAppleToken } from "./handle-apple-token";

interface IdTokenAuthOptions {
	/**
	 * The providers allowed to authenticate the user.
	 *
	 * @default
	 * ```ts
	 * ["google" "apple"]
	 * ```
	 */
	allowedProviders?: ("google" | "apple")[];
}

async function handleGoogleToken(ctx: GenericEndpointContext) {
	const clientId = ctx.context.options.socialProviders?.google?.clientId;
	const idToken = ctx.body.idToken as string;
	if (!clientId) {
		logger.error(
			"Google client id not found!. Make sure to add it in the socialProviders object in the options",
		);
		throw new APIError("BAD_REQUEST", {
			message: "Google client id not found",
		});
	}
	const googlePublicKeyUrl = `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${idToken}`;
	const { data: tokenInfo } = await betterFetch<{
		aud: string;
		iss: string;
		email: string;
		email_verified: boolean;
		name: string;
		picture: string;
		sub: string;
	}>(googlePublicKeyUrl);
	if (!tokenInfo) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid id token",
		});
	}
	const isValid =
		tokenInfo.aud === clientId &&
		tokenInfo.iss === "https://accounts.google.com";
	if (!isValid) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid id token",
		});
	}
	return {
		user: {
			email: tokenInfo.email,
			emailVerified: tokenInfo.email_verified,
			name: tokenInfo.name,
			image: tokenInfo.picture,
		},
		account: {
			accountId: tokenInfo.sub,
			providerId: "google",
		},
	};
}

/**
 * A plugin to authenticate users using an id token
 * in OIDC flow.
 */
export const idTokenAuth = (options?: IdTokenAuthOptions) => {
	const opts = {
		allowedProviders: ["google", "facebook", "apple"],
		...options,
	};
	return {
		id: "id-token-auth",
		endpoints: {
			signInWithIdToken: createAuthEndpoint(
				"/sign-in/id-token",
				{
					method: "POST",
					body: z.object({
						/**
						 * Id token to authenticate the user.
						 */
						idToken: z.string(),
						/**
						 * Access token returned by the provider.
						 */
						accessToken: z.string().optional(),
						/**
						 * If the id token contains a nonce, the hash
						 * of this value is compared to the value id in the token
						 */
						nonce: z.string().optional(),
						/**
						 * The provider used to authenticate the user.
						 */
						provider: z.enum(["google", "apple"]),
					}),
				},
				async (ctx) => {
					const { provider } = ctx.body;
					const isAllowed = opts.allowedProviders.includes(provider);
					if (!isAllowed) {
						throw new APIError("FORBIDDEN", {
							message: `${provider} is not allowed`,
						});
					}
					let data: {
						user: Omit<User, "createdAt" | "id" | "updatedAt">;
						account: {
							providerId: string;
							accountId: string;
						};
					} | null = null;
					switch (provider) {
						case "google": {
							data = await handleGoogleToken(ctx);
							break;
						}
						case "apple": {
							data = await handleAppleToken(ctx);
							break;
						}
						default: {
							throw new APIError("BAD_REQUEST", {
								message: "Invalid provider",
							});
						}
					}
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

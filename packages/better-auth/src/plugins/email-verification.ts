import { base64url } from "jose";
import { z } from "zod";
import { createJWT, parseJWT, validateJWT } from "../jwt";
import type { Providers } from "../providers";
import type { InternalResponse } from "../routes/types";
import type { BetterAuthPlugin } from "./types";

interface EmailVerificationOptions {
	/**
	 * Send email to the user with the verification url.
	 */
	sendEmail: (email: string, url: string) => Promise<void>;
	/**
	 * Expiry time for the token.
	 * @default 60 * 60 * 24 (1 day)
	 */
	expiresIn?: number;
	/**
	 * On which providers to enable email verification.
	 * @default ["credential"]
	 */
	providers?: (keyof Providers)[];
	/**
	 * Redirect URL after email verification.
	 */
	redirectURL: {
		/**
		 * URL to redirect to on success.
		 */
		success: string;
		/**
		 * URL to redirect to on error. The error will be =
		 * appended as a query param.
		 */
		error: string;
	};
}

/**
 * Email verification plugin. This plugin will send an email
 * to the user with a token to verify the email on sign up.
 */
export const emailVerification = (
	opts: EmailVerificationOptions,
): BetterAuthPlugin => {
	const options = {
		expiresIn: 60 * 60 * 24,
		providers: ["credential"],
		...opts,
	};
	return {
		id: "verify-email",
		name: "Email Verification",
		version: "0.0.1",
		hooks: {
			matcher(context) {
				const check =
					context.request.action === "signup" &&
					options.providers.includes(context.request.body.provider);
				return check;
			},
			async after(context, response) {
				if (response.metadata?.isError) {
					return null;
				}
				const {
					data: { email },
				} = z
					.object({
						data: z.object({
							email: z.string(),
						}),
					})
					.parse(context.request.body);

				const token = await createJWT({
					payload: {
						email,
					},
					secret: context.secret,
					expiresIn: options.expiresIn || 60 * 60 * 24,
				});
				const encoded = base64url.encode(token);
				const url = `${context.request.url.toString()}/verify-email?token=${encoded}`;
				await options.sendEmail(email, url);
				return null;
			},
		},
		handler: async (context) => {
			const token = context.request.url.searchParams.get("token");
			if (!token) {
				return {
					status: 302,
					headers: {
						Location: `${options.redirectURL.error}?error=Token not found`,
					},
					metadata: {
						isError: true,
					},
				};
			}
			const decoded = new TextDecoder().decode(base64url.decode(token));
			const isValid = await validateJWT(decoded, context.secret);
			if (!isValid) {
				return {
					status: 302,
					headers: {
						Location: `${options.redirectURL.error}?error=Invalid token`,
					},
					metadata: {
						isError: true,
					},
				} satisfies InternalResponse;
			}
			const payload = parseJWT<{ email: string }>(decoded);
			if ((payload.exp as number) < Date.now() / 1000) {
				return {
					status: 302,
					headers: {
						Location: `${options.redirectURL.error}?error=Token expired`,
					},
					metadata: {
						isError: true,
					},
				};
			}
			await context.adapter.updateUserByEmail(
				payload.email,
				{
					emailVerified: true,
				},
				context,
			);
			return {
				status: 302,
				headers: {
					Location: options.redirectURL.success,
				},
			};
		},
	};
};

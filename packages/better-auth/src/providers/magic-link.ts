import { base64url } from "jose";
import { z } from "zod";
import { BetterAuthError } from "@better-auth/shared";
import { createJWT, parseJWT, validateJWT } from "../jwt";
import type { Context } from "../routes/types";
import { createSession } from "../utils/session";
import type { Provider } from "./types";

interface MagicLinkOptions {
	sendEmail: (email: string, url: string) => Promise<void>;
	/**
	 * Redirect URL
	 * You can pass this when you call on the client.
	 */
	redirect?: {
		error: string;
		success: string;
	};
}

export const magicLink = (options?: MagicLinkOptions) => {
	const schema = z.object({
		callbackURL: z.string(),
		currentURL: z.string(),
		allowSignUp: z.boolean().default(false),
		data: z
			.object({
				email: z.string(),
			})
			.and(z.record(z.string(), z.any())),
	});
	async function signIn(context: Context) {
		const data = schema.safeParse(context.request.body);
		if (data.error) {
			return {
				status: 400,
				statusText: "Invalid Data",
			};
		}
		const {
			data: { email },
			currentURL,
			callbackURL,
		} = data.data;
		let user = await context.adapter.findUserByEmail(email, context);
		/**
		 * Redirect URL
		 */
		const redirect = callbackURL
			? {
					error: options?.redirect?.error || currentURL,
					success: formatURL(callbackURL, currentURL),
				}
			: {
					error: options?.redirect?.error || currentURL,
					success: options?.redirect?.success || new URL(currentURL).origin,
				};
		if (!user) {
			if (data.data.allowSignUp) {
				if (!data.data.data) {
					return {
						status: 400,
						statusText: "Invalid User Registration Data",
					};
				}
				const response = await context.adapter.createUser(
					{
						user: data.data.data,
						account: {
							providerId: "magic_link",
							accountId: email,
						},
					},
					context,
				);
				user = response.user;
			} else {
				return {
					status: 302,
					Location: `${redirect.error}?error=user_doesn't_exist`,
				};
			}
		}
		const token = await createJWT({
			payload: {
				email,
				redirect: {
					error: formatURL(redirect.error, currentURL),
					redirect: formatURL(redirect.error, currentURL),
				},
			},
			secret: context.secret,
			expiresIn: 60 * 60 * 2,
		});
		const encoded = base64url.encode(token);
		const url = `${context.request.url.toString()}/magic-link/verify?token=${encoded}`;
		await options?.sendEmail(email, url);
		return {
			status: 200,
			body: {
				success: true,
			},
		};
	}
	return {
		id: "magic-link" as const,
		name: "magic-link",
		type: "custom",
		signIn,
		async signUp(context) {
			const data = schema.parse(context.request.body);
			const user = await context.adapter.findUserByEmail(
				data.data.email,
				context,
			);

			if (user) {
				return {
					status: 302,
					Location: `${data.currentURL}?error=user_already_exists`,
				};
			}

			return await signIn({
				...context,
				request: {
					...context.request,
					body: data,
				},
			} as Context);
		},
		handler: {
			matcher: (context) => context.request.action.startsWith("magic-link"),
			handler: async (context) => {
				const token = context.request.url.searchParams.get("token");
				if (!token) {
					return {
						status: 403,
					};
				}
				const decoded = new TextDecoder().decode(base64url.decode(token));
				const isValid = await validateJWT(decoded, context.secret);
				if (!isValid) {
					return {
						status: 403,
					};
				}
				const payload = parseJWT<{
					email: string;
					redirect: {
						success: string;
						error: string;
					};
				}>(decoded);
				const user = await context.adapter.findUserByEmail(
					payload.email,
					context,
				);
				if (!user) {
					return {
						status: 302,
						Location: `${payload.redirect.error}?error=user_not_found`,
					};
				}
				await createSession(user.id, context);
				return {
					status: 200,
				};
			},
		},
		input: z.object({
			email: z.string(),
		}),
	} satisfies Provider;
};

function formatURL(pathOrURL: string, currentURL: string) {
	if (pathOrURL.startsWith("/")) {
		return `${new URL(currentURL).origin}/${pathOrURL}`;
	}
	if (pathOrURL.startsWith("http")) {
		return pathOrURL;
	}
	throw new BetterAuthError("Redirect url passed in magic links are invalid.");
}

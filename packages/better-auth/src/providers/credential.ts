import { z } from "zod";
import type { User } from "../adapters/types";
import { setSessionCookie } from "../cookies";
import { hashPassword, validatePassword } from "../crypto/password";
import { BetterAuthError } from "@better-auth/shared/error";
import { createSession } from "../utils/session";
import type { Provider } from "./types";

type CredentialOption = {};

/**
 * Credential provider for better auth.
 * Note: Credential provider only works on node environment.
 * It uses argon2 for hashing the password.
 */
export const credential = <O extends CredentialOption>(options?: O) => {
	const input = z.object({
		email: z.string(),
		password: z.string(),
	});
	return {
		id: "credential" as const,
		name: "Credential",
		type: "custom",
		async signIn(context) {
			const {
				data: { email, password },
				currentURL,
				callbackURL,
			} = z
				.object({
					data: z.object({
						email: z.string(),
						password: z.string(),
					}),
					currentURL: z.string(),
					callbackURL: z.string(),
				})
				.parse(context.request.body);

			const user = await context._db.findOne<
				User & { [key in string]: string }
			>({
				model: context.user.modelName || "user",
				where: [
					{
						field: "email",
						value: email,
					},
				],
			});
			if (!user) {
				return {
					status: 401,
					body: {
						error: "user_not_found",
					},
				};
			}
			const passwordHash = user["password"];
			if (!passwordHash) {
				throw new BetterAuthError(
					"Password field is missing in the user table.",
				);
			}
			try {
				const isValid = await validatePassword(
					password,
					passwordHash,
					context.secret,
				);
				if (!isValid) {
					return {
						status: 401,
						body: {
							error: "invalid_password",
						},
					};
				}
			} catch (e) {
				return {
					status: 401,
					body: {
						error: "invalid_password",
					},
				};
			}
			const session = await context.adapter.createSession(user.id, context);
			setSessionCookie(context, session.id);
			return {
				status: 200,
				body: {
					redirect: true,
					url: callbackURL,
				},
			};
		},
		async signUp(context) {
			const { data, autoCreateSession, currentURL, callbackURL } =
				context.request.body;
			if (!data) {
				throw new BetterAuthError("Data is required for sign up.");
			}

			const userExist = await context.adapter.findUserByEmail(
				data["email"],
				context,
			);
			if (userExist) {
				return {
					status: 400,
					body: {
						error: "user_already_exist",
					},
				};
			}

			const user = await context.adapter.createUser(
				{
					user: {
						...data,
						["password"]: await hashPassword(data["password"], context.secret),
						emailVerified: false,
					},
					account: {
						providerId: "credential",
						accountId: data["email"],
					},
				},
				context,
			);

			if (autoCreateSession) {
				await createSession(user.user.id, context);
			}
			return {
				status: 200,
				body: {
					redirect: true,
					url: callbackURL,
				},
			};
		},
		input,
	} satisfies Provider;
};

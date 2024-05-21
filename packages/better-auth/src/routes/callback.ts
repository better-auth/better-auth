import { ProviderError } from "@better-auth/shared/error";
import { z } from "zod";
import type { User } from "../adapters/types";
import { parseUser } from "../adapters/utils";
import { setSessionCookie } from "../cookies";
import { getState } from "../oauth2/signin";
import { getTokens } from "../oauth2/tokens";
import { withPlugins } from "../plugins/utils";
import { getProvider } from "../providers/utils";
import type { Context, InternalResponse } from "./types";

const callbackQuerySchema = z.object({
	code: z.string(),
	state: z.string(),
	provider: z.string(),
});

export type CallbackContext = Context<{}, z.infer<typeof callbackQuerySchema>>;
export const callback = async (context: CallbackContext) => {
	const parsedQuery = callbackQuerySchema.safeParse(context.request.query);
	if (!parsedQuery.success) {
		const error = context.request.url.searchParams.get("error");
		const errorDesc = context.request.url.searchParams.get("error_description");
		const state = context.request.url.searchParams.get("state");
		if (!state) {
			throw new ProviderError(
				`state is not returned from ${context.request.url.searchParams.get(
					"provider",
				)}`,
			);
		}
		const { currentURL } = getState(state);
		return {
			status: 302,
			headers: {
				Location: `${currentURL}?error=${error}&error_description=${errorDesc}`,
			},
		} satisfies InternalResponse;
	}

	const provider = getProvider(context, parsedQuery.data.provider);
	if (provider?.type === "oauth" || provider?.type === "oidc") {
		const storedState = context.request.cookies.get(context.cookies.state.name);
		const state = parsedQuery.data.state;
		const { currentURL } = getState(state);
		if (storedState !== state) {
			return {
				status: 302,
				headers: {
					Location: `${currentURL}?error=invalid_state`,
				},
			} satisfies InternalResponse;
		}
		const tokens = await getTokens(context, provider);
		if (tokens.error) {
			return {
				status: 302,
				headers: {
					Location: `${currentURL}?error=${tokens.error}`,
				},
			} satisfies InternalResponse;
		}
		if (provider.type === "oauth" || provider.type === "oidc") {
			const profile = await provider.getUserInfo(tokens as any);

			const {
				callbackURL,
				currentURL,
				signUp: { data, autoCreateSession, onlySignUp },
			} = getState(state);
			let userAccount = await context.adapter.findAccount(
				{
					providerId: provider.id,
					accountId: profile.id,
				},
				context,
			);

			/**
			 * If the provider is oidc we should check the nonce
			 */
			if (provider.type === "oidc") {
				if (profile.nonce) {
					const nonce = context.request.cookies.get(context.cookies.nonce.name);
					if (profile.nonce !== nonce) {
						return {
							status: 302,
							headers: {
								Location: `${currentURL}?error=invalid_nonce`,
							},
						} satisfies InternalResponse;
					}
				}
			}

			/**
			 * If the request is only to signup a new user we should return error if the user exist
			 */
			if (onlySignUp && userAccount) {
				return {
					status: 302,
					headers: {
						Location: `${currentURL}?error=user_already_exist`,
					},
				} satisfies InternalResponse;
			}
			let userData: Record<string, any> | null = null;
			if (!userAccount) {
				/**
				 * If account linking is on we first try to link the user
				 */
				if (provider.params.linkAccounts) {
					const shouldLink = provider.params.linkAccounts.enabler
						? await provider.params.linkAccounts.enabler(profile)
						: true;
					if (shouldLink) {
						const { field, key } = provider.params.linkAccounts;
						const user = await context._db.findOne<User>({
							model: context.user.modelName,
							where: [
								{
									field,
									value: profile[key as keyof typeof profile],
								},
							],
						});
						if (user) {
							userAccount = await context.adapter.linkAccount(
								{
									userId: user.id,
									providerId: provider.id,
									accountId: profile.id,
								},
								context,
							);
							userData = user;
						}
					}
				}

				/**
				 * If the request is only to signin we should return error
				 */
				if (!userData && !data) {
					return {
						status: 302,
						headers: {
							Location: `${callbackURL}?error=user_not_found`,
						},
					} satisfies InternalResponse;
				}

				/**
				 * If the user wasn't linked we'll create a new user with the signup data
				 */
				if (!userData) {
					let signUpData: Record<string, any> = {};
					for (const key in data) {
						if (typeof data[key] === "string") {
							const constructedKey = (data[key] as string).split(".");
							let value: any = profile;
							for (const k of constructedKey) {
								value = value[k as keyof typeof value];
							}
							signUpData[key] = value;
						} else if ("value" in data[key]) {
							signUpData[key] = data[key].value;
						}
					}
					/**
					 * Parse the user data
					 */
					signUpData = parseUser(signUpData, context);

					const accountData: {
						providerId: string;
						accountId: string;
						[key: string]: any;
					} = {
						providerId: provider.id,
						accountId: profile.id,
					};

					for (const key in context.account.additionalFields) {
						accountData[key] =
							tokens[
								context.account.additionalFields[key] as keyof typeof tokens
							];
					}

					try {
						const { user, account } = await context.adapter.createUser(
							{
								user: signUpData,
								account: accountData,
							},
							context,
						);
						userAccount = account;
						userData = user;
					} catch (e) {
						return {
							status: 302,
							headers: {
								Location: `${currentURL}?error=user_already_exist`,
							},
						};
					}
				}
			}

			if (!userData) {
				userData = await context.adapter.findUserById(
					userAccount?.userId as string,
					context,
				);
			}
			/**
			 * This is to handler if the user specified not creating sessions on signup
			 */
			if (autoCreateSession) {
				const session = await context.adapter.createSession(
					userData?.id as string,
					context,
				);
				setSessionCookie(context, session.id);
			}
			return {
				status: 302,
				headers: {
					Location: callbackURL,
				},
			} satisfies InternalResponse;
		}
		return {
			status: 200,
		} satisfies InternalResponse;
	}
	throw new ProviderError("Invalid provider type");
};

export const callbackHandler = withPlugins(callback, ["csrf"]);

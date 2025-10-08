import { APIError, createEmailVerificationToken } from "../api";
import type { schema } from "../db";
import type {
	AuthPluginSchema,
	GenericEndpointContext,
	SchemaTypes,
	User,
} from "../types";
import { logger } from "../utils";
import { isDevelopment } from "../utils/env";
import { setTokenUtil } from "./utils";

export async function handleOAuthUserInfo<
	S extends AuthPluginSchema<typeof schema>,
>(
	c: GenericEndpointContext<S>,
	{
		userInfo,
		account,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
	}: {
		userInfo: Omit<SchemaTypes<S["user"], true>, "createdAt" | "updatedAt">;
		account: Omit<
			SchemaTypes<S["account"]>,
			"id" | "userId" | "createdAt" | "updatedAt"
		>;
		callbackURL?: string;
		disableSignUp?: boolean;
		overrideUserInfo?: boolean;
	},
) {
	const dbUser = await c.context.internalAdapter
		.findOAuthUser(
			userInfo.email.toLowerCase(),
			account.accountId,
			account.providerId,
		)
		.catch((e) => {
			logger.error(
				"Better auth was unable to query your database.\nError: ",
				e,
			);
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=internal_server_error`);
		});
	let user = dbUser?.user;
	let isRegister = !user;

	if (dbUser) {
		const hasBeenLinked = dbUser.accounts.find(
			(a) =>
				a.providerId === account.providerId &&
				a.accountId === account.accountId,
		);
		if (!hasBeenLinked) {
			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders?.includes(
				account.providerId as "apple",
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				if (isDevelopment) {
					logger.warn(
						`User already exist but account isn't linked to ${account.providerId}. To read more about how account linking works in Better Auth see https://www.better-auth.com/docs/concepts/users-accounts#account-linking.`,
					);
				}
				return {
					error: "account not linked",
					data: null,
				};
			}
			try {
				await c.context.internalAdapter.linkAccount(
					{
						providerId: account.providerId,
						accountId: userInfo.id.toString(),
						userId: dbUser.user.id,
						accessToken: await setTokenUtil(account.accessToken, c.context),
						refreshToken: await setTokenUtil(account.refreshToken, c.context),
						idToken: account.idToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
						password: undefined,
					},
					c as any as GenericEndpointContext<typeof schema>,
				);
			} catch (e) {
				logger.error("Unable to link account", e);
				return {
					error: "unable to link account",
					data: null,
				};
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}
		} else {
			if (c.context.options.account?.updateAccountOnSignIn !== false) {
				const updateData = Object.fromEntries(
					Object.entries({
						idToken: account.idToken,
						accessToken: await setTokenUtil(account.accessToken, c.context),
						refreshToken: await setTokenUtil(account.refreshToken, c.context),
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
					}).filter(([_, value]) => value !== undefined),
				);

				if (Object.keys(updateData).length > 0) {
					await c.context.internalAdapter.updateAccount(
						hasBeenLinked.id,
						updateData,
						c as any as GenericEndpointContext<typeof schema>,
					);
				}
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			) {
				await c.context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
			}
		}
		if (overrideUserInfo) {
			const { id: _, ...restUserInfo } = userInfo;
			// update user info from the provider if overrideUserInfo is true
			await c.context.internalAdapter.updateUser(dbUser.user.id, {
				...restUserInfo,
				email: userInfo.email.toLowerCase(),
				emailVerified:
					(userInfo.email.toLowerCase() as string) === dbUser.user.email
						? dbUser.user.emailVerified || (userInfo.emailVerified as boolean)
						: (userInfo.emailVerified as boolean),
			});
		}
	} else {
		if (disableSignUp) {
			return {
				error: "signup disabled",
				data: null,
				isRegister: false,
			};
		}
		try {
			const { id: _, ...restUserInfo } = userInfo;
			user = await c.context.internalAdapter
				.createOAuthUser(
					{
						...(restUserInfo as Omit<User, "id" | "createdAt" | "updatedAt">),
						email: userInfo.email.toLowerCase(),
						createdAt: undefined,
						updatedAt: undefined,
					},
					{
						accessToken: await setTokenUtil(account.accessToken, c.context),
						refreshToken: await setTokenUtil(account.refreshToken, c.context),
						idToken: account.idToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
						providerId: account.providerId,
						accountId: userInfo.id.toString(),
						password: undefined,
					},
					c,
				)
				.then((res) => res?.user);
			if (
				!userInfo.emailVerified &&
				user &&
				c.context.options.emailVerification?.sendOnSignUp
			) {
				const token = await createEmailVerificationToken(
					c.context.secret,
					user.email,
					undefined,
					c.context.options.emailVerification?.expiresIn,
				);
				const url = `${c.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
				await c.context.options.emailVerification?.sendVerificationEmail?.(
					{
						user,
						url,
						token,
					},
					c.request,
				);
			}
		} catch (e: any) {
			logger.error(e);
			if (e instanceof APIError) {
				return {
					error: e.message,
					data: null,
					isRegister: false,
				};
			}
			return {
				error: "unable to create user",
				data: null,
				isRegister: false,
			};
		}
	}
	if (!user) {
		return {
			error: "unable to create user",
			data: null,
			isRegister: false,
		};
	}

	const session = await c.context.internalAdapter.createSession(user.id, c);
	if (!session) {
		return {
			error: "unable to create session",
			data: null,
			isRegister: false,
		};
	}
	return {
		data: {
			session,
			user,
		},
		error: null,
		isRegister,
	};
}

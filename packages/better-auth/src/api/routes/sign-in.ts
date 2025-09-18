import { APIError } from "better-call";
import * as z from "zod";
import { implEndpoint } from "../../better-call/server";
import { signInSocialDef, signInEmailDef } from "./shared";
import { setSessionCookie } from "../../cookies";
import { createEmailVerificationToken } from "./email-verification";
import { generateState } from "../../utils";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { BASE_ERROR_CODES } from "../../error/codes";

export const signInSocial = () =>
	implEndpoint(signInSocialDef, async (c) => {
		const provider = c.context.socialProviders.find(
			(p) => p.id === c.body.provider,
		);
		if (!provider) {
			c.context.logger.error(
				"Provider not found. Make sure to add the provider in your auth config",
				{
					provider: c.body.provider,
				},
			);
			throw new APIError("NOT_FOUND", {
				message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND,
			});
		}

		if (c.body.idToken) {
			if (!provider.verifyIdToken) {
				c.context.logger.error(
					"Provider does not support id token verification",
					{
						provider: c.body.provider,
					},
				);
				throw new APIError("NOT_FOUND", {
					message: BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED,
				});
			}
			const { token, nonce } = c.body.idToken;
			const valid = await provider.verifyIdToken(token, nonce);
			if (!valid) {
				c.context.logger.error("Invalid id token", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.INVALID_TOKEN,
				});
			}
			const userInfo = await provider.getUserInfo({
				idToken: token,
				accessToken: c.body.idToken.accessToken,
				refreshToken: c.body.idToken.refreshToken,
			});
			if (!userInfo || !userInfo?.user) {
				c.context.logger.error("Failed to get user info", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO,
				});
			}
			if (!userInfo.user.email) {
				c.context.logger.error("User email not found", {
					provider: c.body.provider,
				});
				throw new APIError("UNAUTHORIZED", {
					message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND,
				});
			}
			const data = await handleOAuthUserInfo(c, {
				userInfo: {
					...userInfo.user,
					email: userInfo.user.email,
					id: String(userInfo.user.id),
					name: userInfo.user.name || "",
					image: userInfo.user.image,
					emailVerified: userInfo.user.emailVerified || false,
				},
				account: {
					providerId: provider.id,
					accountId: String(userInfo.user.id),
					accessToken: c.body.idToken.accessToken,
				},
				callbackURL: c.body.callbackURL,
				disableSignUp:
					(provider.disableImplicitSignUp && !c.body.requestSignUp) ||
					provider.disableSignUp,
			});
			if (data.error) {
				throw new APIError("UNAUTHORIZED", {
					message: data.error,
				});
			}
			await setSessionCookie(c, data.data!);
			return c.json({
				redirect: false,
				token: data.data!.session.token,
				url: undefined,
				user: {
					id: data.data!.user.id,
					email: data.data!.user.email,
					name: data.data!.user.name,
					image: data.data!.user.image,
					emailVerified: data.data!.user.emailVerified,
					createdAt: data.data!.user.createdAt,
					updatedAt: data.data!.user.updatedAt,
				},
			});
		}

		const { codeVerifier, state } = await generateState(c);
		const url = await provider.createAuthorizationURL({
			state,
			codeVerifier,
			redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			scopes: c.body.scopes,
			loginHint: c.body.loginHint,
		});

		return c.json({
			url: url.toString(),
			redirect: !c.body.disableRedirect,
		});
	});

export const signInEmail = () =>
	implEndpoint(signInEmailDef, async (ctx) => {
		if (!ctx.context.options?.emailAndPassword?.enabled) {
			ctx.context.logger.error(
				"Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://better-auth.com/docs/authentication/email-password` for more!",
			);
			throw new APIError("BAD_REQUEST", {
				message: "Email and password is not enabled",
			});
		}
		const { email, password } = ctx.body;
		const isValidEmail = z.string().email().safeParse(email);
		if (!isValidEmail.success) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.INVALID_EMAIL,
			});
		}
		const user = await ctx.context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});

		if (!user) {
			// Hash password to prevent timing attacks from revealing valid email addresses
			// By hashing passwords for invalid emails, we ensure consistent response times
			await ctx.context.password.hash(password);
			ctx.context.logger.error("User not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			});
		}

		const credentialAccount = user.accounts.find(
			(a) => a.providerId === "credential",
		);
		if (!credentialAccount) {
			ctx.context.logger.error("Credential account not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			});
		}
		const currentPassword = credentialAccount?.password;
		if (!currentPassword) {
			ctx.context.logger.error("Password not found", { email });
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			});
		}
		const validPassword = await ctx.context.password.verify({
			hash: currentPassword,
			password,
		});
		if (!validPassword) {
			ctx.context.logger.error("Invalid password");
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			});
		}

		if (
			ctx.context.options?.emailAndPassword?.requireEmailVerification &&
			!user.user.emailVerified
		) {
			if (!ctx.context.options?.emailVerification?.sendVerificationEmail) {
				throw new APIError("FORBIDDEN", {
					message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
				});
			}

			if (ctx.context.options?.emailVerification?.sendOnSignIn) {
				const token = await createEmailVerificationToken(
					ctx.context.secret,
					user.user.email,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
				const url = `${
					ctx.context.baseURL
				}/verify-email?token=${token}&callbackURL=${
					ctx.body.callbackURL || "/"
				}`;
				await ctx.context.options.emailVerification.sendVerificationEmail(
					{
						user: user.user,
						url,
						token,
					},
					ctx.request,
				);
			}

			throw new APIError("FORBIDDEN", {
				message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED,
			});
		}

		const session = await ctx.context.internalAdapter.createSession(
			user.user.id,
			ctx,
			ctx.body.rememberMe === false,
		);

		if (!session) {
			ctx.context.logger.error("Failed to create session");
			throw new APIError("UNAUTHORIZED", {
				message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
			});
		}

		await setSessionCookie(
			ctx,
			{
				session,
				user: user.user,
			},
			ctx.body.rememberMe === false,
		);
		return ctx.json({
			redirect: !!ctx.body.callbackURL,
			token: session.token,
			url: ctx.body.callbackURL,
			user: {
				id: user.user.id,
				email: user.user.email,
				name: user.user.name,
				image: user.user.image,
				emailVerified: user.user.emailVerified,
				createdAt: user.user.createdAt,
				updatedAt: user.user.updatedAt,
			},
		});
	});

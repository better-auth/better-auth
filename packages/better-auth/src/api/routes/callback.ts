import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { parseState } from "../../utils/state";
import { userSchema } from "../../adapters/schema";
import { HIDE_ON_CLIENT_METADATA } from "../../client/client-utils";

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: "GET",
		query: z.object({
			state: z.string(),
			code: z.string(),
			code_verifier: z.string().optional(),
		}),
		metadata: HIDE_ON_CLIENT_METADATA,
	},
	async (c) => {
		const provider = c.context.options.providers?.find(
			(p) => p.id === c.params.id,
		);
		if (!provider || provider.type !== "oauth2") {
			c.context.logger.error(
				"Oauth provider with id",
				c.params.id,
				"not found",
			);
			throw new APIError("NOT_FOUND");
		}
		const tokens = await provider.provider.validateAuthorizationCode(
			c.query.code,
			c.query.code_verifier || "",
		);
		if (!tokens) {
			c.context.logger.error("Code verification failed");
			throw new APIError("UNAUTHORIZED");
		}

		const user = await provider.userInfo.getUserInfo(tokens);
		const data = userSchema.safeParse({
			...user,
			id: user?.id.toString(),
		});
		if (!user || data.success === false) {
			throw new APIError("BAD_REQUEST");
		}
		const { callbackURL, currentURL } = parseState(c.query.state);
		if (!callbackURL) {
			c.context.logger.error("Callback URL not found");
			throw new APIError("FORBIDDEN");
		}
		//find user in db
		const dbUser = await c.context.internalAdapter.findUserByEmail(user.email);
		let userId = dbUser?.user.id;
		if (dbUser) {
			//check if user has already linked this provider
			const hasBeenLinked = dbUser.accounts.find(
				(a) => a.providerId === provider.id,
			);
			if (!hasBeenLinked && !user.emailVerified) {
				c.context.logger.error("User already exists");
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "user_already_exists");
				throw c.redirect(url.toString());
			}

			if (!hasBeenLinked && user.emailVerified) {
				await c.context.internalAdapter.linkAccount({
					providerId: provider.id,
					accountId: user.id,
					id: `${provider.id}:${user.id}`,
					userId: dbUser.user.id,
					...tokens,
				});
			}
		} else {
			try {
				await c.context.internalAdapter.createOAuthUser(user, {
					...tokens,
					id: `${provider.id}:${user.id}`,
					providerId: provider.id,
					accountId: user.id,
					userId: user.id,
				});
				userId = user.id;
			} catch (e) {
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "unable_to_create_user");
				c.setHeader("Location", url.toString());
				throw c.redirect(url.toString());
			}
		}
		//this should never happen
		if (!userId) throw new APIError("INTERNAL_SERVER_ERROR");

		//create session
		const session = await c.context.internalAdapter.createSession(
			userId,
			c.request,
		);
		try {
			await c.setSignedCookie(
				c.context.authCookies.sessionToken.name,
				session.id,
				c.context.secret,
				c.context.authCookies.sessionToken.options,
			);
		} catch (e) {
			c.context.logger.error("Unable to set session cookie", e);
			const url = new URL(currentURL || callbackURL);
			url.searchParams.set("error", "unable_to_create_session");
			throw c.redirect(url.toString());
		}
		throw c.redirect(callbackURL);
	},
);

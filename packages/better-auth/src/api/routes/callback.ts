import { APIError } from "better-call";
import { z } from "zod";
import { userSchema } from "../../adapters/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../utils/state";
import { createAuthEndpoint } from "../call";
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
		const provider = c.context.options.socialProvider?.find(
			(p) => p.id === c.params.id,
		);
		if (!provider) {
			c.context.logger.error(
				"Oauth provider with id",
				c.params.id,
				"not found",
			);
			throw new APIError("NOT_FOUND");
		}
		const tokens = await provider.validateAuthorizationCode(
			c.query.code,
			c.query.code_verifier || "",
		);
		if (!tokens) {
			c.context.logger.error("Code verification failed");
			throw new APIError("UNAUTHORIZED");
		}
		const user = await provider.getUserInfo(tokens).then((res) => res?.user);
		const id = generateId();
		const data = userSchema.safeParse({
			...user,
			id,
		});
		const { callbackURL, currentURL } = parseState(c.query.state);
		if (!user || data.success === false) {
			if (currentURL) {
				throw c.redirect(`${currentURL}?error=oauth_validation_failed`);
			} else {
				throw new APIError("BAD_REQUEST");
			}
		}
		if (!callbackURL) {
			c.context.logger.error("Callback URL not found");
			throw new APIError("FORBIDDEN");
		}
		//find user in db
		const dbUser = await c.context.internalAdapter.findUserByEmail(user.email);
		const userId = dbUser?.user.id;
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
				await c.context.internalAdapter.createOAuthUser(data.data, {
					...tokens,
					id: `${provider.id}:${user.id}`,
					providerId: provider.id,
					accountId: user.id,
					userId: id,
				});
			} catch (e) {
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "unable_to_create_user");
				c.setHeader("Location", url.toString());
				throw c.redirect(url.toString());
			}
		}
		//this should never happen
		if (!userId && !id)
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "Unable to create user",
			});
		//create session
		const session = await c.context.internalAdapter.createSession(
			userId || id,
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

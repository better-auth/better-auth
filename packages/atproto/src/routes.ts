import { Agent } from "@atproto/api";
import type { NodeOAuthClient } from "@atproto/oauth-client-node";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import type { AtprotoAuthOptions, AtprotoUserFields } from "./types";
import { atprotoPlaceholderEmail, fetchProfileWithAgent } from "./utils";

const ATPROTO_PROVIDER_ID = "atproto";

/**
 * Validate a user-supplied callbackURL against trustedOrigins to prevent
 * open-redirect. Returns the validated URL or throws BAD_REQUEST.
 */
function assertTrustedCallback(
	ctx: any,
	callbackURL: string | undefined,
): string {
	const target = callbackURL || "/";
	if (target.startsWith("/")) {
		// Relative paths are safe; isTrustedOrigin will accept them with the flag.
		if (!ctx.context.isTrustedOrigin(target, { allowRelativePaths: true })) {
			throw new APIError("BAD_REQUEST", {
				message: "callbackURL is not a trusted origin",
			});
		}
		return target;
	}
	if (!ctx.context.isTrustedOrigin(target)) {
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is not a trusted origin",
		});
	}
	return target;
}

export function createAtprotoEndpoints(
	getClient: () => NodeOAuthClient,
	options: AtprotoAuthOptions,
) {
	return {
		atprotoClientMetadata: createAuthEndpoint(
			"/atproto/client-metadata.json",
			{ method: "GET" },
			async (ctx) => {
				return ctx.json(getClient().clientMetadata);
			},
		),

		atprotoJwks: createAuthEndpoint(
			"/atproto/jwks.json",
			{ method: "GET" },
			async (ctx) => {
				return ctx.json(getClient().jwks);
			},
		),

		atprotoSignIn: createAuthEndpoint(
			"/atproto/sign-in",
			{
				method: "POST",
				body: z.object({
					handle: z.string(),
					callbackURL: z.string().optional(),
				}),
			},
			async (ctx) => {
				const { handle, callbackURL } = ctx.body as {
					handle: string;
					callbackURL?: string;
				};
				const safeCallback = assertTrustedCallback(ctx, callbackURL);
				try {
					const url = await getClient().authorize(handle, {
						state: JSON.stringify({ callbackURL: safeCallback }),
					});
					return ctx.json({ url: url.toString(), redirect: true });
				} catch (err) {
					ctx.context.logger.error("atproto sign-in failed", err);
					throw new APIError("BAD_REQUEST", {
						message: `Failed to initiate atproto auth for handle: ${handle}`,
					});
				}
			},
		),

		atprotoCallback: createAuthEndpoint(
			"/atproto/callback",
			{
				method: "GET",
				query: z
					.object({
						code: z.string().optional(),
						state: z.string().optional(),
						iss: z.string().optional(),
						error: z.string().optional(),
						error_description: z.string().optional(),
					})
					.optional(),
			},
			async (ctx) => {
				const query = (ctx.query ?? {}) as Record<string, string | undefined>;

				if (query.error) {
					ctx.context.logger.error(
						"atproto callback error param",
						query.error,
						query.error_description,
					);
					throw new APIError("UNAUTHORIZED", {
						message: "atproto authentication was rejected",
					});
				}

				// Reconstruct URLSearchParams from the validated query object so that
				// NodeOAuthClient.callback() can parse the OAuth response parameters.
				const params = new URLSearchParams();
				for (const [key, val] of Object.entries(query)) {
					if (val !== undefined) params.set(key, val);
				}

				let atSession: Awaited<
					ReturnType<NodeOAuthClient["callback"]>
				>["session"];
				let appState: { callbackURL?: string } = {};
				try {
					const result = await getClient().callback(params);
					atSession = result.session;
					appState = JSON.parse(result.state || "{}");
				} catch (err) {
					ctx.context.logger.error("atproto callback exchange failed", err);
					throw new APIError("UNAUTHORIZED", {
						message: "Failed to complete atproto authentication",
					});
				}

				const did = atSession.did;
				const profile = await fetchProfileWithAgent(atSession);
				const { internalAdapter, adapter } = ctx.context;
				const placeholderEmail = atprotoPlaceholderEmail(did);

				// Detect an existing logged-in session to support account linking.
				let currentUserId: string | undefined;
				try {
					const cookieName = ctx.context.authCookies.sessionToken.name;
					const sessionToken = await ctx.getSignedCookie(
						cookieName,
						ctx.context.secret,
					);
					if (sessionToken) {
						const existingSession = await adapter.findOne<{ userId: string }>({
							model: "session",
							where: [{ field: "token", value: sessionToken }],
						});
						if (existingSession) currentUserId = existingSession.userId;
					}
				} catch {
					// No existing session, proceed with regular flow.
				}

				const existingUser = await internalAdapter.findOAuthUser(
					placeholderEmail,
					did,
					ATPROTO_PROVIDER_ID,
				);

				let userId: string;
				let userRecord: Record<string, unknown>;

				if (existingUser) {
					userId = existingUser.user.id;
					userRecord = existingUser.user as Record<string, unknown>;
					if (!existingUser.linkedAccount) {
						await internalAdapter.linkAccount({
							providerId: ATPROTO_PROVIDER_ID,
							accountId: did,
							userId,
							accessToken: "atproto-session",
							refreshToken: undefined,
							accessTokenExpiresAt: undefined,
							refreshTokenExpiresAt: undefined,
						});
					}
					await adapter.update({
						model: "user",
						where: [{ field: "id", value: userId }],
						update: buildUserUpdate(did, profile, /*newUser*/ true),
					});
				} else if (currentUserId) {
					const linkingEnabled =
						ctx.context.options.account?.accountLinking?.enabled !== false;
					if (!linkingEnabled) {
						throw new APIError("FORBIDDEN", {
							message:
								"Account linking is disabled. Cannot link atproto account to an existing user.",
						});
					}
					userId = currentUserId;
					// Fetch user record for session cookie
					const foundUser = await internalAdapter.findUserById(userId);
					if (!foundUser) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "User not found",
						});
					}
					userRecord = foundUser as Record<string, unknown>;
					await internalAdapter.linkAccount({
						providerId: ATPROTO_PROVIDER_ID,
						accountId: did,
						userId,
						accessToken: "atproto-session",
						refreshToken: undefined,
						accessTokenExpiresAt: undefined,
						refreshTokenExpiresAt: undefined,
					});
					await adapter.update({
						model: "user",
						where: [{ field: "id", value: userId }],
						update: buildUserUpdate(did, profile, /*newUser*/ false),
					});
				} else {
					if (options.disableSignUp) {
						throw new APIError("FORBIDDEN", {
							message:
								"Sign up is disabled. Only existing users can sign in with atproto.",
						});
					}
					const mapped = options.mapProfileToUser?.(profile);
					const created = await internalAdapter.createOAuthUser(
						{
							name:
								mapped?.name || profile.displayName || profile.handle || did,
							email: mapped?.email || placeholderEmail,
							image: mapped?.image || profile.avatar || undefined,
							emailVerified: false,
						},
						{
							providerId: ATPROTO_PROVIDER_ID,
							accountId: did,
							accessToken: "atproto-session",
							refreshToken: undefined,
							accessTokenExpiresAt: undefined,
							refreshTokenExpiresAt: undefined,
						},
					);
					if (!created?.user?.id) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to create user",
						});
					}
					userId = created.user.id;
					userRecord = created.user as Record<string, unknown>;
					await adapter.update({
						model: "user",
						where: [{ field: "id", value: userId }],
						update: buildUserUpdate(did, profile, /*newUser*/ true),
					});
				}

				// Backfill userId on the atprotoSession row so it links to the user.
				const sessionRow = await adapter.findOne<{ id: string }>({
					model: "atprotoSession",
					where: [{ field: "did", value: did }],
				});
				if (sessionRow) {
					await adapter.update({
						model: "atprotoSession",
						where: [{ field: "id", value: sessionRow.id }],
						update: { userId },
					});
				}

				const newSession = await internalAdapter.createSession(userId);
				await setSessionCookie(ctx, {
					session: newSession,
					user: userRecord as any,
				});

				// Re-validate callbackURL before redirecting (defense in depth).
				const finalCallback = assertTrustedCallback(ctx, appState.callbackURL);
				return ctx.redirect(finalCallback);
			},
		),

		atprotoGetSession: createAuthEndpoint(
			"/atproto/session",
			{ method: "GET", use: [sessionMiddleware] },
			async (ctx) => {
				const user = ctx.context.session.user as Partial<AtprotoUserFields>;
				const did = user.atprotoDid;
				if (!did) return ctx.json({ active: false });
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 5000);
				try {
					const atSession = await getClient().restore(did);
					const agent = new Agent(atSession);
					const res = await agent.getProfile(
						{ actor: did },
						{ signal: controller.signal },
					);
					return ctx.json({
						active: true,
						did,
						handle: res.data.handle,
						displayName: res.data.displayName,
						avatar: res.data.avatar,
						banner: res.data.banner,
						description: res.data.description,
					});
				} catch (err) {
					ctx.context.logger.error("atproto session restore failed", err);
					return ctx.json({ active: false, did });
				} finally {
					clearTimeout(timer);
				}
			},
		),

		atprotoRestore: createAuthEndpoint(
			"/atproto/restore",
			{ method: "POST", use: [sessionMiddleware] },
			async (ctx) => {
				const user = ctx.context.session.user as Partial<AtprotoUserFields>;
				const did = user.atprotoDid;
				if (!did) return ctx.json({ active: false });
				try {
					await getClient().restore(did);
					return ctx.json({ active: true, did });
				} catch (err) {
					ctx.context.logger.error("atproto restore failed", err);
					return ctx.json({ active: false, did });
				}
			},
		),
	};
}

function buildUserUpdate(
	did: string,
	profile: {
		handle: string;
		displayName?: string;
		avatar?: string;
		description?: string;
		banner?: string;
	},
	newUser: boolean,
) {
	const update: Record<string, unknown> = {
		atprotoDid: did,
		atprotoHandle: profile.handle,
		updatedAt: new Date(),
	};
	// Avoid overwriting an existing user's `name`/`image` for the linking path.
	if (newUser) {
		if (profile.displayName) update.name = profile.displayName;
		if (profile.avatar) update.image = profile.avatar;
	}
	if (profile.description !== undefined)
		update.atprotoBio = profile.description;
	if (profile.banner !== undefined) update.atprotoBanner = profile.banner;
	return update;
}

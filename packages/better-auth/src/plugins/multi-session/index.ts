import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { Session } from "@better-auth/core/db";
import { defineErrorCodes } from "@better-auth/core/utils";
import type { CookieOptions } from "better-call";
import * as z from "zod";
import { APIError, getSessionFromCtx, sessionMiddleware } from "../../api";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { generateRandomString } from "../../crypto/random";

interface MultiSessionConfig {
	/**
	 * The maximum number of sessions a user can have
	 * at a time
	 * @default 5
	 */
	maximumSessions?: number | undefined;
	/**
	 * The name of the cookie to store the device id
	 * @default "better-auth.device_id" (`better-auth` is the default cookie prefix)
	 */
	deviceIdCookieName?: string;
	/**
	 * The name of the cookie to store the device id
	 *
	 * @default {
	 *  maxAge: 31536000, // 1 year
	 *  secure: true,
	 *  httpOnly: true,
	 *  sameSite: "lax",
	 *  path: "/",
	 * }
	 */
	deviceIdCookieOptions?: CookieOptions;
}

const ERROR_CODES = defineErrorCodes({
	INVALID_SESSION_TOKEN: "Invalid session token",
});

export const multiSession = (options?: MultiSessionConfig | undefined) => {
	const opts = {
		maximumSessions: 5,
		deviceIdCookieName: "device_id",
		deviceIdCookieOptions: {
			maxAge: 31536000, // 1 year
			secure: true,
			httpOnly: true,
			sameSite: "lax",
			path: "/",
		},
		...options,
	} satisfies MultiSessionConfig;
	const getDeviceCookie = (ctx: GenericEndpointContext) => {
		const deviceIdCookie = ctx.context.createAuthCookie(
			opts.deviceIdCookieName,
			opts.deviceIdCookieOptions,
		);
		return deviceIdCookie;
	};
	return {
		id: "multi-session",
		init() {
			return {
				options: {
					databaseHooks: {
						session: {
							create: {
								before: async (session, ctx) => {
									if (!ctx) return;
									const deviceIdCookie = getDeviceCookie(ctx);
									let deviceId = await ctx.getSignedCookie(
										deviceIdCookie.name,
										ctx.context.secret,
									);

									if (!deviceId) {
										deviceId = generateRandomString(32);
										await ctx.setSignedCookie(
											deviceIdCookie.name,
											deviceId,
											ctx.context.secret,
											deviceIdCookie.attributes,
										);
									}

									const sessions = await ctx.context.adapter.findMany<Session>({
										model: "session",
										where: [
											{
												field: "deviceId",
												value: deviceId,
											},
										],
									});

									const validSessions = sessions.filter(
										(s) => s.expiresAt > new Date(),
									);

									if (validSessions.length >= opts.maximumSessions) {
										// Sort by created/expires to find oldest?
										// Session usually has createdAt. If not, expiresAt works as proxy if duration is constant.
										// But better-auth session schema has `createdAt`.
										const sorted = validSessions.sort(
											(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
										);

										// Delete oldest sessions until we fit in the limit
										const toDelete = sorted.slice(
											0,
											validSessions.length - (opts.maximumSessions - 1),
										);

										await Promise.all(
											toDelete.map((s) =>
												ctx.context.internalAdapter.deleteSession(s.token),
											),
										);
									}

									return {
										data: {
											deviceId,
										},
									};
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * GET `/multi-session/list-device-sessions`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listDeviceSessions`
			 *
			 * **client:**
			 * `authClient.multiSession.listDeviceSessions`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-list-device-sessions)
			 */
			listDeviceSessions: createAuthEndpoint(
				"/multi-session/list-device-sessions",
				{
					method: "GET",
					requireHeaders: true,
				},
				async (ctx) => {
					const deviceIdCookie = ctx.context.createAuthCookie(
						opts.deviceIdCookieName,
					);
					const deviceId = await ctx.getSignedCookie(
						deviceIdCookie.name,
						ctx.context.secret,
					);

					const session = await getSessionFromCtx(ctx);

					if (!deviceId) {
						if (session) {
							return ctx.json([session]);
						}
						return ctx.json([]);
					}

					const sessions = await ctx.context.adapter.findMany<Session>({
						model: "session",
						where: [
							{
								field: "deviceId",
								value: deviceId,
							},
						],
					});
					const validSessions = sessions.filter(
						(session) => session.expiresAt > new Date(),
					);

					// TODO: use join instead of this
					const sessionWithUsers = await Promise.all(
						validSessions.map(async (s) => {
							const user = await ctx.context.internalAdapter.findUserById(
								s.userId,
							);
							if (!user) return null;
							return {
								session: s,
								user,
							};
						}),
					);

					return ctx.json(sessionWithUsers.filter((s) => s !== null));
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/set-active`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.setActiveSession`
			 *
			 * **client:**
			 * `authClient.multiSession.setActive`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-set-active)
			 */
			setActiveSession: createAuthEndpoint(
				"/multi-session/set-active",
				{
					method: "POST",
					body: z.object({
						sessionToken: z.string().meta({
							description: "The session token to set as active",
						}),
					}),
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Set the active session",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													session: {
														$ref: "#/components/schemas/Session",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { sessionToken } = ctx.body;
					const deviceIdCookie = ctx.context.createAuthCookie(
						opts.deviceIdCookieName,
						opts.deviceIdCookieOptions,
					);
					const deviceId = await ctx.getSignedCookie(
						deviceIdCookie.name,
						ctx.context.secret,
					);

					if (!deviceId) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_SESSION_TOKEN,
						});
					}

					const session =
						await ctx.context.internalAdapter.findSession(sessionToken);

					if (
						session?.session.deviceId !== deviceId ||
						!session ||
						session.session.expiresAt < new Date()
					) {
						throw new APIError("UNAUTHORIZED");
					}

					await setSessionCookie(ctx, session);
					return ctx.json(session);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/multi-session/revoke`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.revokeDeviceSession`
			 *
			 * **client:**
			 * `authClient.multiSession.revoke`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/multi-session#api-method-multi-session-revoke)
			 */
			revokeDeviceSession: createAuthEndpoint(
				"/multi-session/revoke",
				{
					method: "POST",
					body: z.object({
						sessionToken: z.string().meta({
							description: "The session token to revoke",
						}),
					}),
					requireHeaders: true,
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Revoke a device session",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													status: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const sessionToken = ctx.body.sessionToken;
					await ctx.context.internalAdapter.deleteSession(sessionToken);

					// If revoked session was the active one, clear cookie
					if (ctx.context.session?.session.token === sessionToken) {
						deleteSessionCookie(ctx);
					}

					return ctx.json({
						status: true,
					});
				},
			),
		},
		schema: {
			session: {
				fields: {
					deviceId: {
						type: "string",
						required: false,
						input: false,
					},
				},
			},
		},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

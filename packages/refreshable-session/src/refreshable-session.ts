import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	HookEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { createHMAC } from "@better-auth/utils/hmac";
import { BetterAuthError } from "better-auth";
import { APIError } from "better-auth/api";
import {
	deleteSessionCookie,
	expireCookie,
	parseSetCookieHeader,
	setSessionCookie,
} from "better-auth/cookies";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "better-auth/crypto";
import { parseSessionOutput, parseUserOutput } from "better-auth/db";
import type { Session, User } from "better-auth/types";
import { serializeSignedCookie } from "better-call";
import * as z from "zod";
import { REFRESHABLE_SESSION_ERROR_CODES as ERROR_CODES } from "./error-codes";
import { refreshableSessionSchema } from "./schema";
import type {
	RefreshableSessionNativeClient,
	RefreshableSessionOptions,
	RefreshableSessionRecord,
} from "./types";
import { PACKAGE_VERSION } from "./version";

const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = 60 * 60 * 24 * 30;
const DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN = 60 * 15;
const DEFAULT_REUSE_INTERVAL = 30;
const CLIENT_ID_HEADER = "x-better-auth-client-id";
const SET_ACCESS_TOKEN_HEADER = "set-auth-token";
const SET_REFRESH_TOKEN_HEADER = "set-refresh-token";
const SET_ACCESS_TOKEN_EXPIRES_AT_HEADER = "set-auth-token-expires-at";

type SessionWithUser = {
	session: Session & Record<string, unknown>;
	user: User & Record<string, unknown>;
};

type RotatedTokenPair = {
	refreshToken: string;
	sessionToken: string;
	sessionWithUser: SessionWithUser;
};

type RefreshableHookContext = HookEndpointContext & {
	refreshableSessionRotation?: RotatedTokenPair | undefined;
	refreshableSessionExpireCookie?: boolean | undefined;
};

type RefreshableDatabaseHookContext = GenericEndpointContext & {
	refreshableSessionRotatingFamilyId?: string | undefined;
};

const refreshSessionBodySchema = z.object({
	refreshToken: z.string().min(1).optional(),
	clientId: z.string().min(1).optional(),
});

const revokeRefreshSessionBodySchema = refreshSessionBodySchema;

function tryDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

async function hashToken(token: string): Promise<string> {
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(token),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

function readHeader(ctx: HookEndpointContext, name: string): string | null {
	return ctx.request?.headers.get(name) ?? ctx.headers?.get(name) ?? null;
}

function findNativeClient(
	clients: RefreshableSessionNativeClient[],
	clientId: string | null,
): RefreshableSessionNativeClient | null {
	if (!clientId) return null;
	return clients.find((client) => client.clientId === clientId) ?? null;
}

function getAccessTokenHeader(client: RefreshableSessionNativeClient): string {
	return client.accessTokenHeader ?? "x-better-auth-session-token";
}

function getRefreshTokenHeader(client: RefreshableSessionNativeClient): string {
	return client.refreshTokenHeader ?? "x-better-auth-refresh-token";
}

function exposeHeaders(ctx: GenericEndpointContext, names: string[]) {
	const current =
		ctx.context.responseHeaders?.get("access-control-expose-headers") ?? "";
	const exposed = new Set(
		current
			.split(",")
			.map((header: string) => header.trim())
			.filter(Boolean),
	);
	for (const name of names) exposed.add(name);
	ctx.setHeader(
		"Access-Control-Expose-Headers",
		Array.from(exposed).join(", "),
	);
}

async function signSessionToken(
	ctx: GenericEndpointContext,
	token: string,
): Promise<string> {
	return tryDecode(
		(await serializeSignedCookie("", token, ctx.context.secret)).replace(
			"=",
			"",
		),
	);
}

async function isValidSignedSessionToken(
	ctx: GenericEndpointContext,
	token: string,
): Promise<boolean> {
	const decoded = tryDecode(token);
	const [value, signature] = decoded.split(".");
	if (!value || !signature) return false;
	try {
		return await createHMAC("SHA-256", "base64urlnopad").verify(
			ctx.context.secret,
			value,
			signature,
		);
	} catch {
		return false;
	}
}

function injectSessionCookie(
	ctx: GenericEndpointContext,
	signedSessionToken: string,
): Headers {
	const source = ctx.request?.headers ?? ctx.headers;
	const headers = new Headers(source);
	const cookieName = ctx.context.authCookies.sessionToken.name;
	const existingCookie = headers.get("cookie");
	const encodedToken = encodeURIComponent(signedSessionToken);
	const sessionCookie = `${cookieName}=${encodedToken}`;
	const otherCookies = (existingCookie ?? "")
		.split(";")
		.map((cookie) => cookie.trim())
		.filter((cookie) => cookie && !cookie.startsWith(`${cookieName}=`));
	headers.set("cookie", [...otherCookies, sessionCookie].join("; "));
	return headers;
}

function getPublicSessionResponse(
	ctx: GenericEndpointContext,
	sessionWithUser: SessionWithUser,
) {
	const { token: _token, ...session } = parseSessionOutput(
		ctx.context.options,
		sessionWithUser.session,
	);
	return {
		session,
		user: parseUserOutput(ctx.context.options, sessionWithUser.user),
	};
}

export function refreshableSession(
	options?: RefreshableSessionOptions | undefined,
) {
	const refreshTokenExpiresIn =
		options?.refreshTokenExpiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRES_IN;
	const refreshTokenReuseInterval =
		options?.refreshTokenReuseInterval ?? DEFAULT_REUSE_INTERVAL;
	const nativeClients = options?.nativeClients ?? [];
	const browser = options?.browser;
	const browserEnabled = browser?.enabled ?? false;

	if (refreshTokenExpiresIn <= 0) {
		throw new BetterAuthError(
			"refreshTokenExpiresIn must be greater than zero",
		);
	}
	if (refreshTokenReuseInterval < 0) {
		throw new BetterAuthError(
			"refreshTokenReuseInterval must be greater than or equal to zero",
		);
	}
	const clientIds = nativeClients.map((client) => client.clientId);
	if (new Set(clientIds).size !== clientIds.length) {
		throw new BetterAuthError("native client IDs must be unique");
	}
	for (const client of nativeClients) {
		if (
			client.accessTokenExpiresIn !== undefined &&
			client.accessTokenExpiresIn <= 0
		) {
			throw new BetterAuthError(
				`accessTokenExpiresIn for native client "${client.clientId}" must be greater than zero`,
			);
		}
		if (
			client.refreshTokenExpiresIn !== undefined &&
			client.refreshTokenExpiresIn <= 0
		) {
			throw new BetterAuthError(
				`refreshTokenExpiresIn for native client "${client.clientId}" must be greater than zero`,
			);
		}
	}
	if (
		browser?.refreshTokenExpiresIn !== undefined &&
		browser.refreshTokenExpiresIn <= 0
	) {
		throw new BetterAuthError(
			"refreshTokenExpiresIn for the browser must be greater than zero",
		);
	}

	function getNativeAccessTokenExpiresIn(
		client: RefreshableSessionNativeClient,
	): number {
		return (
			client.accessTokenExpiresIn ?? DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN
		);
	}

	function getRefreshTokenExpiresIn(clientId: string | null): number {
		if (clientId) {
			return (
				findNativeClient(nativeClients, clientId)?.refreshTokenExpiresIn ??
				refreshTokenExpiresIn
			);
		}
		return browser?.refreshTokenExpiresIn ?? refreshTokenExpiresIn;
	}

	function getRefreshCookie(ctx: GenericEndpointContext) {
		return ctx.context.createAuthCookie(
			browser?.cookieName ?? "refresh_token",
			{
				...browser?.cookieAttributes,
				httpOnly: true,
				maxAge: getRefreshTokenExpiresIn(null),
			},
		);
	}

	async function readBrowserRefreshToken(
		ctx: GenericEndpointContext,
	): Promise<string | null> {
		if (!browserEnabled) return null;
		const cookie = getRefreshCookie(ctx);
		const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
		return typeof token === "string" ? token : null;
	}

	function expireRefreshCookie(ctx: GenericEndpointContext) {
		if (!browserEnabled) return;
		expireCookie(ctx, getRefreshCookie(ctx));
	}

	async function setBrowserRefreshToken(
		ctx: GenericEndpointContext,
		refreshToken: string,
	) {
		if (!browserEnabled) return;
		const cookie = getRefreshCookie(ctx);
		await ctx.setSignedCookie(
			cookie.name,
			refreshToken,
			ctx.context.secret,
			cookie.attributes,
		);
	}

	async function setNativeTokenHeaders(
		ctx: GenericEndpointContext,
		sessionWithUser: SessionWithUser,
		refreshToken?: string | undefined,
	) {
		const signedSessionToken = await signSessionToken(
			ctx,
			sessionWithUser.session.token,
		);
		ctx.setHeader(SET_ACCESS_TOKEN_HEADER, signedSessionToken);
		ctx.setHeader(
			SET_ACCESS_TOKEN_EXPIRES_AT_HEADER,
			sessionWithUser.session.expiresAt.toISOString(),
		);
		const exposedHeaders: string[] = [
			SET_ACCESS_TOKEN_HEADER,
			SET_ACCESS_TOKEN_EXPIRES_AT_HEADER,
		];
		if (refreshToken) {
			ctx.setHeader(SET_REFRESH_TOKEN_HEADER, refreshToken);
			exposedHeaders.push(SET_REFRESH_TOKEN_HEADER);
		}
		exposeHeaders(ctx, exposedHeaders);

		// Native clients authenticate with the configured header, not cookies.
		expireCookie(ctx, ctx.context.authCookies.sessionToken);
		expireCookie(ctx, ctx.context.authCookies.sessionData);
		expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
	}

	async function applyNativeAccessLifetime(
		ctx: GenericEndpointContext,
		sessionWithUser: SessionWithUser,
		nativeClient: RefreshableSessionNativeClient,
	): Promise<SessionWithUser> {
		const now = new Date();
		const session = await ctx.context.internalAdapter.updateSession(
			sessionWithUser.session.token,
			{
				expiresAt: new Date(
					now.getTime() + getNativeAccessTokenExpiresIn(nativeClient) * 1000,
				),
				updatedAt: now,
			},
		);
		if (!session) {
			throw APIError.from(
				"INTERNAL_SERVER_ERROR",
				ERROR_CODES.NATIVE_SESSION_UPDATE_FAILED,
			);
		}
		return {
			session: session as Session & Record<string, unknown>,
			user: sessionWithUser.user,
		};
	}

	async function applyTokenTransport(
		ctx: GenericEndpointContext,
		sessionWithUser: SessionWithUser,
		refreshToken: string,
		clientId: string | null,
	) {
		await setSessionCookie(ctx, sessionWithUser);
		if (clientId) {
			const nativeClient = findNativeClient(nativeClients, clientId);
			if (!nativeClient) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_CLIENT);
			}
			await setNativeTokenHeaders(ctx, sessionWithUser, refreshToken);
			return;
		}
		await setBrowserRefreshToken(ctx, refreshToken);
	}

	async function findRefreshRecord(
		ctx: GenericEndpointContext,
		refreshToken: string,
	): Promise<RefreshableSessionRecord | null> {
		return ctx.context.adapter.findOne<RefreshableSessionRecord>({
			model: "refreshableSession",
			where: [{ field: "tokenHash", value: await hashToken(refreshToken) }],
		});
	}

	async function revokeFamily(ctx: GenericEndpointContext, familyId: string) {
		const now = new Date();
		await ctx.context.adapter.updateMany({
			model: "refreshableSession",
			where: [{ field: "familyId", value: familyId }],
			update: { revokedAt: now, updatedAt: now },
		});

		const records =
			await ctx.context.adapter.findMany<RefreshableSessionRecord>({
				model: "refreshableSession",
				where: [{ field: "familyId", value: familyId }],
			});
		const sessionIds = records
			.map((record) => record.sessionId)
			.filter((sessionId): sessionId is string => Boolean(sessionId));

		if (sessionIds.length === 0) return;
		const sessions = await ctx.context.adapter.findMany<Session>({
			model: "session",
			where: [{ field: "id", value: sessionIds, operator: "in" }],
		});
		for (const session of sessions) {
			await ctx.context.internalAdapter.deleteSession(session.token);
		}
	}

	function assertClient(
		record: RefreshableSessionRecord,
		requestedClientId: string | undefined,
	) {
		const storedClientId = record.clientId ?? undefined;
		if (storedClientId !== requestedClientId) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_CLIENT);
		}
		if (storedClientId && !findNativeClient(nativeClients, storedClientId)) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_CLIENT);
		}
	}

	async function recoverReplacement(
		ctx: GenericEndpointContext,
		record: RefreshableSessionRecord,
	): Promise<RotatedTokenPair | null> {
		if (
			!record.replacementRefreshToken ||
			!record.replacementSessionToken ||
			!record.replacementExpiresAt ||
			record.replacementExpiresAt.getTime() <= Date.now()
		) {
			return null;
		}
		try {
			const [refreshToken, sessionToken] = await Promise.all([
				symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: record.replacementRefreshToken,
				}),
				symmetricDecrypt({
					key: ctx.context.secretConfig,
					data: record.replacementSessionToken,
				}),
			]);
			const sessionWithUser =
				await ctx.context.internalAdapter.findSession(sessionToken);
			if (
				!sessionWithUser ||
				sessionWithUser.session.expiresAt.getTime() <= Date.now()
			) {
				return null;
			}
			return {
				refreshToken,
				sessionToken,
				sessionWithUser: sessionWithUser as SessionWithUser,
			};
		} catch {
			return null;
		}
	}

	async function rotateRefreshToken(
		ctx: GenericEndpointContext,
		refreshToken: string,
		requestedClientId?: string | undefined,
	): Promise<RotatedTokenPair> {
		let record = await findRefreshRecord(ctx, refreshToken);
		if (!record) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_TOKEN);
		}
		assertClient(record, requestedClientId);
		if (record.expiresAt.getTime() <= Date.now()) {
			await revokeFamily(ctx, record.familyId);
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.REFRESH_TOKEN_EXPIRED);
		}
		if (record.revokedAt) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.REFRESH_TOKEN_REUSED);
		}
		if (record.rotatedAt) {
			const replacement = await recoverReplacement(ctx, record);
			if (replacement) return replacement;
			await revokeFamily(ctx, record.familyId);
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.REFRESH_TOKEN_REUSED);
		}

		const user = await ctx.context.internalAdapter.findUserById(record.userId);
		if (!user) {
			await revokeFamily(ctx, record.familyId);
			throw APIError.from(
				"UNAUTHORIZED",
				ERROR_CODES.REFRESH_SESSION_USER_NOT_FOUND,
			);
		}

		const now = new Date();
		const nextRefreshToken = generateRandomString(48, "a-z", "A-Z", "0-9");
		const nextSessionToken = generateRandomString(32, "a-z", "A-Z", "0-9");
		const nativeClient = record.clientId
			? findNativeClient(nativeClients, record.clientId)
			: null;
		const nextSessionExpiresAt = nativeClient
			? new Date(
					now.getTime() + getNativeAccessTokenExpiresIn(nativeClient) * 1000,
				)
			: undefined;
		const replacementExpiresAt = new Date(
			now.getTime() + refreshTokenReuseInterval * 1000,
		);
		const [encryptedRefreshToken, encryptedSessionToken] = await Promise.all([
			symmetricEncrypt({
				key: ctx.context.secretConfig,
				data: nextRefreshToken,
			}),
			symmetricEncrypt({
				key: ctx.context.secretConfig,
				data: nextSessionToken,
			}),
		]);

		const result = await runWithTransaction(ctx.context.adapter, async () => {
			const adapter = await getCurrentAdapter(ctx.context.adapter);
			const won = await adapter.incrementOne<RefreshableSessionRecord>({
				model: "refreshableSession",
				where: [
					{ field: "id", value: record!.id },
					{ field: "rotatedAt", value: null, operator: "eq" },
					{ field: "revokedAt", value: null, operator: "eq" },
				],
				increment: {},
				set: {
					rotatedAt: now,
					updatedAt: now,
					replacementRefreshToken: encryptedRefreshToken,
					replacementSessionToken: encryptedSessionToken,
					replacementExpiresAt,
				},
			});
			if (!won) return null;

			const newSession = await ctx.context.internalAdapter.createSession(
				record!.userId,
				false,
				{
					token: nextSessionToken,
					createdAt: record!.authTime,
					updatedAt: now,
					...(nextSessionExpiresAt ? { expiresAt: nextSessionExpiresAt } : {}),
				},
				true,
			);
			if (!newSession) {
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					ERROR_CODES.REFRESH_SESSION_CREATION_FAILED,
				);
			}

			const child = await adapter.create<RefreshableSessionRecord>({
				model: "refreshableSession",
				data: {
					tokenHash: await hashToken(nextRefreshToken),
					familyId: record!.familyId,
					userId: record!.userId,
					sessionId: newSession.id,
					clientId: record!.clientId,
					authTime: record!.authTime,
					expiresAt: new Date(
						now.getTime() + getRefreshTokenExpiresIn(record!.clientId) * 1000,
					),
					rotatedAt: null,
					revokedAt: null,
					replacementRefreshToken: null,
					replacementSessionToken: null,
					replacementExpiresAt: null,
					createdAt: now,
					updatedAt: now,
				},
			});

			if (record!.sessionId) {
				const previousSession = await adapter.findOne<Session>({
					model: "session",
					where: [{ field: "id", value: record!.sessionId }],
				});
				if (previousSession && previousSession.token !== nextSessionToken) {
					const hookContext = ctx as RefreshableDatabaseHookContext;
					hookContext.refreshableSessionRotatingFamilyId = record!.familyId;
					try {
						await ctx.context.internalAdapter.deleteSession(
							previousSession.token,
						);
					} finally {
						hookContext.refreshableSessionRotatingFamilyId = undefined;
					}
				}
			}

			return { newSession, child };
		});

		if (!result) {
			record = await findRefreshRecord(ctx, refreshToken);
			const replacement = record ? await recoverReplacement(ctx, record) : null;
			if (replacement) return replacement;
			if (record) await revokeFamily(ctx, record.familyId);
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.REFRESH_TOKEN_REUSED);
		}

		return {
			refreshToken: nextRefreshToken,
			sessionToken: nextSessionToken,
			sessionWithUser: {
				session: result.newSession as Session & Record<string, unknown>,
				user: user as User & Record<string, unknown>,
			},
		};
	}

	async function issueInitialRefreshToken(
		ctx: GenericEndpointContext,
		sessionWithUser: SessionWithUser,
		clientId: string | null,
	) {
		const existing =
			await ctx.context.adapter.findOne<RefreshableSessionRecord>({
				model: "refreshableSession",
				where: [{ field: "sessionId", value: sessionWithUser.session.id }],
			});
		if (existing) return;

		const refreshToken = generateRandomString(48, "a-z", "A-Z", "0-9");
		const now = new Date();
		await ctx.context.adapter.create<RefreshableSessionRecord>({
			model: "refreshableSession",
			data: {
				tokenHash: await hashToken(refreshToken),
				familyId: generateRandomString(32, "a-z", "A-Z", "0-9"),
				userId: sessionWithUser.user.id,
				sessionId: sessionWithUser.session.id,
				clientId,
				authTime: sessionWithUser.session.createdAt,
				expiresAt: new Date(
					now.getTime() + getRefreshTokenExpiresIn(clientId) * 1000,
				),
				rotatedAt: null,
				revokedAt: null,
				replacementRefreshToken: null,
				replacementSessionToken: null,
				replacementExpiresAt: null,
				createdAt: now,
				updatedAt: now,
			},
		});

		if (clientId) {
			const nativeClient = findNativeClient(nativeClients, clientId);
			if (!nativeClient) return;
			await setNativeTokenHeaders(ctx, sessionWithUser, refreshToken);
			return;
		}
		await setBrowserRefreshToken(ctx, refreshToken);
	}

	function responseDisablesRememberMe(ctx: GenericEndpointContext): boolean {
		const setCookie = ctx.context.responseHeaders?.get("set-cookie");
		if (!setCookie) return false;
		const cookie = parseSetCookieHeader(setCookie).get(
			ctx.context.authCookies.dontRememberToken.name,
		);
		return Boolean(cookie?.value && cookie["max-age"] !== 0);
	}

	async function readRefreshTokenForRequest(
		ctx: GenericEndpointContext,
		body: z.infer<typeof refreshSessionBodySchema>,
	): Promise<{ refreshToken: string; clientId?: string | undefined }> {
		if (body.refreshToken || body.clientId) {
			if (!body.refreshToken || !body.clientId) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_CLIENT);
			}
			return { refreshToken: body.refreshToken, clientId: body.clientId };
		}
		const refreshToken = await readBrowserRefreshToken(ctx);
		if (!refreshToken) {
			throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_REFRESH_TOKEN);
		}
		return { refreshToken };
	}

	return {
		id: "refreshable-session",
		version: PACKAGE_VERSION,
		$ERROR_CODES: ERROR_CODES,
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						session: {
							delete: {
								async before(session, context) {
									const records =
										await ctx.adapter.findMany<RefreshableSessionRecord>({
											model: "refreshableSession",
											where: [{ field: "sessionId", value: session.id }],
										});
									const rotatingFamilyId = (
										context as RefreshableDatabaseHookContext | null
									)?.refreshableSessionRotatingFamilyId;
									const familyIds = new Set(
										records
											.map((record) => record.familyId)
											.filter((familyId) => familyId !== rotatingFamilyId),
									);
									for (const familyId of familyIds) {
										await ctx.adapter.updateMany({
											model: "refreshableSession",
											where: [{ field: "familyId", value: familyId }],
											update: {
												revokedAt: new Date(),
												updatedAt: new Date(),
											},
										});
									}
								},
							},
						},
					},
					...(browserEnabled && browser?.disableSessionRefresh !== undefined
						? {
								session: {
									...ctx.options.session,
									disableSessionRefresh: browser.disableSessionRefresh,
								},
							}
						: {}),
				},
			};
		},
		schema: refreshableSessionSchema,
		endpoints: {
			refreshSession: createAuthEndpoint(
				"/refresh-session",
				{
					method: "POST",
					body: refreshSessionBodySchema,
				},
				async (ctx) => {
					const credential = await readRefreshTokenForRequest(ctx, ctx.body);
					const rotated = await rotateRefreshToken(
						ctx,
						credential.refreshToken,
						credential.clientId,
					);
					await applyTokenTransport(
						ctx,
						rotated.sessionWithUser,
						rotated.refreshToken,
						credential.clientId ?? null,
					);
					return ctx.json(
						getPublicSessionResponse(ctx, rotated.sessionWithUser),
					);
				},
			),
			revokeRefreshSession: createAuthEndpoint(
				"/revoke-refresh-session",
				{
					method: "POST",
					body: revokeRefreshSessionBodySchema,
				},
				async (ctx) => {
					const credential = await readRefreshTokenForRequest(ctx, ctx.body);
					const record = await findRefreshRecord(ctx, credential.refreshToken);
					if (record) {
						assertClient(record, credential.clientId);
						await revokeFamily(ctx, record.familyId);
					}
					expireRefreshCookie(ctx);
					deleteSessionCookie(ctx);
					return ctx.json({ success: true });
				},
			),
		},
		hooks: {
			before: [
				{
					matcher: (ctx) => Boolean(readHeader(ctx, CLIENT_ID_HEADER)),
					handler: createAuthMiddleware(async (ctx) => {
						const clientId = readHeader(ctx, CLIENT_ID_HEADER);
						if (!findNativeClient(nativeClients, clientId)) {
							throw APIError.from(
								"UNAUTHORIZED",
								ERROR_CODES.INVALID_REFRESH_CLIENT,
							);
						}
					}),
				},
				{
					matcher: (ctx) =>
						nativeClients.some((client) =>
							Boolean(readHeader(ctx, getAccessTokenHeader(client))),
						),
					handler: createAuthMiddleware(async (ctx) => {
						for (const client of nativeClients) {
							const token = readHeader(ctx, getAccessTokenHeader(client));
							if (!token || !(await isValidSignedSessionToken(ctx, token))) {
								continue;
							}
							const headers = injectSessionCookie(ctx, tryDecode(token));
							if (ctx.path === "/get-session") {
								return {
									context: {
										headers,
										query: {
											...ctx.query,
											disableRefresh: true,
										},
									},
								};
							}
							return {
								context: {
									headers,
								},
							};
						}
					}),
				},
				{
					matcher: (ctx) =>
						browserEnabled &&
						ctx.path === "/get-session" &&
						ctx.request?.method === "GET",
					handler: createAuthMiddleware(async (ctx) => {
						const refreshToken = await readBrowserRefreshToken(ctx);
						if (!refreshToken) return;
						const currentSessionToken = await ctx.getSignedCookie(
							ctx.context.authCookies.sessionToken.name,
							ctx.context.secret,
						);
						if (currentSessionToken) {
							const currentSession =
								await ctx.context.internalAdapter.findSession(
									currentSessionToken,
								);
							if (
								currentSession &&
								currentSession.session.expiresAt.getTime() > Date.now()
							) {
								return;
							}
						}
						try {
							const rotated = await rotateRefreshToken(ctx, refreshToken);
							const signedSessionToken = await signSessionToken(
								ctx,
								rotated.sessionToken,
							);
							return {
								context: {
									headers: injectSessionCookie(ctx, signedSessionToken),
									refreshableSessionRotation: rotated,
								},
							};
						} catch (error) {
							if (error instanceof APIError && error.statusCode === 401) {
								return {
									context: { refreshableSessionExpireCookie: true },
								};
							}
							throw error;
						}
					}),
				},
			],
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.path === "/get-session") {
							const hookContext = ctx as RefreshableHookContext;
							const rotation = hookContext.refreshableSessionRotation;
							if (rotation) {
								await applyTokenTransport(
									ctx,
									rotation.sessionWithUser,
									rotation.refreshToken,
									null,
								);
							} else if (hookContext.refreshableSessionExpireCookie) {
								expireRefreshCookie(ctx);
							}
							return;
						}

						if (ctx.path === "/sign-out") {
							let refreshToken = await readBrowserRefreshToken(ctx);
							if (!refreshToken) {
								for (const client of nativeClients) {
									refreshToken = readHeader(ctx, getRefreshTokenHeader(client));
									if (refreshToken) break;
								}
							}
							if (refreshToken) {
								const record = await findRefreshRecord(ctx, refreshToken);
								if (record) await revokeFamily(ctx, record.familyId);
							}
							expireRefreshCookie(ctx);
							return;
						}

						if (
							ctx.path === "/refresh-session" ||
							ctx.path === "/revoke-refresh-session" ||
							!ctx.context.newSession
						) {
							return;
						}

						const newSession = ctx.context.newSession as SessionWithUser;
						const clientId = readHeader(ctx, CLIENT_ID_HEADER);
						const dontRememberMe = responseDisablesRememberMe(ctx);
						if (!clientId && (!browserEnabled || dontRememberMe)) return;

						const persistedSession =
							await ctx.context.internalAdapter.findSession(
								newSession.session.token,
							);
						if (!persistedSession) return;

						let sessionWithUser = persistedSession as SessionWithUser;
						if (clientId) {
							const nativeClient = findNativeClient(nativeClients, clientId);
							if (!nativeClient) {
								throw APIError.from(
									"UNAUTHORIZED",
									ERROR_CODES.INVALID_REFRESH_CLIENT,
								);
							}
							sessionWithUser = await applyNativeAccessLifetime(
								ctx,
								sessionWithUser,
								nativeClient,
							);
						}
						if (dontRememberMe) {
							await setNativeTokenHeaders(ctx, sessionWithUser);
							return;
						}
						await issueInitialRefreshToken(ctx, sessionWithUser, clientId);
					}),
				},
			],
		},
		options,
	} satisfies BetterAuthPlugin;
}

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"refreshable-session": {
			creator: typeof refreshableSession;
		};
	}
}

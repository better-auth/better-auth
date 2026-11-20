import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { createAuthMiddleware } from "better-auth/api";
import { ALGORITHMS, readSkipped, SKIPPED_HEADER } from "./protocol";
import {
	emit,
	enforceBinding,
	getDbscState,
	hashToken,
	markSessionCreated,
	offerRegistration,
	REFRESH_PATH,
	REGISTER_PATH,
	refresh,
	register,
} from "./routes";
import { schema } from "./schema";
import type { DbscOptions, ResolvedDbscOptions } from "./types";
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		dbsc: {
			creator: typeof dbsc;
		};
	}
}

const PROTOCOL_PATHS = [REGISTER_PATH, REFRESH_PATH];

/**
 * Device Bound Session Credentials (experimental).
 *
 * Binds sessions to a key the browser keeps in hardware, so a stolen session
 * cookie stops working on another device once the short-lived bound cookie
 * expires. Browsers without DBSC behave exactly as before. Sessions are only
 * bound by default; set `enforce` to reject a bound session that arrives
 * without its bound cookie.
 *
 * @see https://w3c.github.io/webappsec-dbsc/
 */
export const dbsc = (options?: DbscOptions | undefined) => {
	const opts: ResolvedDbscOptions = {
		...options,
		boundCookieMaxAge: options?.boundCookieMaxAge ?? 600,
		allowedRefreshInitiators: options?.allowedRefreshInitiators ?? ["*"],
		algorithms: options?.algorithms ?? [...ALGORITHMS],
	};

	return {
		id: "dbsc",
		version: PACKAGE_VERSION,
		init(ctx) {
			assertSupported(ctx.options, opts);
			const skipped = ctx.skipOriginCheck;
			return {
				context: {
					// The protocol endpoints are proven by the browser's signature, and
					// a 403 from the origin check would make Chrome delete the session.
					...(skipped !== true && {
						skipOriginCheck: [
							...(Array.isArray(skipped) ? skipped : []),
							...PROTOCOL_PATHS,
						],
					}),
					// Chrome before 159 deletes the session on a 429 refresh. Exact
					// paths come first so a user wildcard cannot catch them, while a
					// user rule for the same path still wins.
					rateLimit: {
						...ctx.rateLimit,
						customRules: {
							...Object.fromEntries(
								PROTOCOL_PATHS.map((path) => [path, false as const]),
							),
							...ctx.rateLimit.customRules,
						},
					},
				},
				options: {
					databaseHooks: {
						session: {
							create: {
								async after(session) {
									await markSessionCreated(session.id);
								},
							},
							delete: {
								async after(session) {
									const tokenHash = await hashToken(session.token);
									await ctx.adapter
										.deleteMany({
											model: "dbscBinding",
											where: [{ field: "tokenHash", value: tokenHash }],
										})
										.catch((error: unknown) =>
											ctx.logger.warn("Failed to delete DBSC binding", {
												error,
											}),
										);
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			dbscRegister: register(opts),
			dbscRefresh: refresh(opts),
			getDbscState: getDbscState(opts),
		},
		hooks: {
			before: opts.enforce
				? [
						{
							// The protocol endpoints are how a stale session becomes
							// fresh again, so they must still see the session cookie.
							matcher: (context) =>
								!PROTOCOL_PATHS.some((path) => path === context.path),
							handler: createAuthMiddleware((ctx) => enforceBinding(ctx, opts)),
						},
					]
				: [],
			after: [
				{
					matcher: (context) =>
						!PROTOCOL_PATHS.some((path) => path === context.path),
					handler: createAuthMiddleware((ctx) => offerRegistration(ctx, opts)),
				},
			],
		},
		async onRequest(request, ctx) {
			for (const { reason, sessionId } of readSkipped(
				request.headers.get(SKIPPED_HEADER),
			)) {
				await emit(ctx, opts, {
					type: "skipped",
					reason,
					bindingId: sessionId,
				});
			}
		},
		schema,
		options: opts,
	} satisfies BetterAuthPlugin;
};

/**
 * Fails at startup on settings Chrome would reject at registration, instead
 * of shipping a plugin that silently never binds.
 */
function assertSupported(
	authOptions: BetterAuthOptions,
	options: ResolvedDbscOptions,
) {
	if (!options.algorithms.length) {
		throw new BetterAuthError("dbsc: `algorithms` must not be empty.");
	}
	if (
		!Number.isSafeInteger(options.boundCookieMaxAge) ||
		options.boundCookieMaxAge < 300
	) {
		throw new BetterAuthError(
			"dbsc: `boundCookieMaxAge` must be an integer of at least 300 seconds, or Chrome runs out of signatures refreshing it.",
		);
	}
	if (authOptions.advanced?.crossSubDomainCookies?.enabled) {
		throw new BetterAuthError(
			"dbsc: `advanced.crossSubDomainCookies` is not supported yet.",
		);
	}
	if (authOptions.advanced?.defaultCookieAttributes?.partitioned) {
		throw new BetterAuthError(
			"dbsc: partitioned cookies cannot be bound, so `advanced.defaultCookieAttributes.partitioned` is not supported.",
		);
	}
}

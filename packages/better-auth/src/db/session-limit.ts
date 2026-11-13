import type { AuthEndpointContext } from "@better-auth/core/context";
import {
	defineRequestState,
	hasRequestState,
	queueAfterTransactionHook,
	runWithEndpointContext,
	tryGetCurrentAuthEndpointContext,
} from "@better-auth/core/context";
import type { InternalLogger } from "@better-auth/core/env";
import type { Session } from "../types";
import { isAPIError } from "../utils/is-api-error";

type SessionLimit = {
	readonly enforce: () => Promise<void>;
	readonly logger: InternalLogger;
};

type PendingSessionLimit = SessionLimit & {
	readonly endpointContext: AuthEndpointContext | undefined;
};

/**
 * Sessions created during the current request that still need
 * `session.maxPerUser` enforced. `null` when nothing will enforce it.
 */
const pendingSessionLimits = defineRequestState<PendingSessionLimit[] | null>(
	() => null,
);

/**
 * Milliseconds since the epoch, or 0 when a row has no creation time.
 */
const toTime = (date: Date | string | null | undefined) => {
	const time = date ? new Date(date).getTime() : 0;
	return Number.isFinite(time) ? time : 0;
};

/**
 * Picks the tokens to revoke so the user keeps their newest `maxPerUser`
 * sessions, counting `session`. Impersonation sessions neither count nor get
 * revoked.
 */
export function selectSessionsOverLimit(
	session: Session,
	sessions: (Session & { impersonatedBy?: string | null | undefined })[],
	maxPerUser: number,
) {
	// Compared in whole seconds, since a database column may store no more.
	// Sessions created alongside `session` enforce the limit themselves, so
	// concurrent sign-ins never revoke each other.
	const createdAt = Math.floor(toTime(session.createdAt) / 1000);
	// `session` is left out and the limit reduced by one, so it is never
	// revoked, even when the list doesn't include it yet.
	return sessions
		.filter((s) => s.token !== session.token && !s.impersonatedBy)
		.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
		.slice(maxPerUser - 1)
		.filter((s) => Math.floor(toTime(s.createdAt) / 1000) < createdAt)
		.map((s) => s.token);
}

function queueSessionLimit({ enforce, logger }: SessionLimit) {
	return queueAfterTransactionHook(enforce, {
		onError(error: unknown) {
			logger.error("Failed to revoke sessions over session.maxPerUser", error);
		},
	});
}

/**
 * Schedules `session.maxPerUser` enforcement for a new session.
 *
 * During a request it runs when the request finishes, so it only applies to
 * sessions the request keeps. A sign-in that stops at a second factor, for
 * example, deletes its session and must not revoke the user's other sessions.
 * Otherwise it runs once the surrounding transaction commits.
 */
export async function scheduleSessionLimit(limit: SessionLimit) {
	const pendingLimits = (await hasRequestState())
		? await pendingSessionLimits.get()
		: null;
	if (!pendingLimits) return queueSessionLimit(limit);
	pendingLimits.push({
		...limit,
		endpointContext: tryGetCurrentAuthEndpointContext(),
	});
}

/**
 * Runs a request and then enforces `session.maxPerUser` for the sessions it
 * created. Must run inside request state. Nested calls share the outermost
 * call's sessions, so the limit applies once, when that call finishes.
 */
export async function runWithSessionLimits<T>(fn: () => Promise<T>) {
	if (await pendingSessionLimits.get()) return fn();
	const pendingLimits: PendingSessionLimit[] = [];
	await pendingSessionLimits.set(pendingLimits);
	let failed = false;
	try {
		return await fn();
	} catch (error) {
		// An `APIError`, redirects included, still sends the session cookie. Any
		// other error fails the request, so it keeps none of its sessions.
		failed = !isAPIError(error);
		throw error;
	} finally {
		// Sessions created after this, by work the request didn't wait for, are
		// enforced right away.
		await pendingSessionLimits.set(null);
		if (!failed) {
			for (const { endpointContext, ...limit } of pendingLimits) {
				await queueSessionLimit({
					...limit,
					// Session delete hooks see the request that created the session.
					enforce: async () => {
						if (!endpointContext) return limit.enforce();
						await runWithEndpointContext(endpointContext, limit.enforce);
					},
				});
			}
		}
	}
}

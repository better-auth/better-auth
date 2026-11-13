import type { InternalAdapter } from "@better-auth/core";
import {
	defineRequestState,
	hasRequestState,
	queueAfterTransactionHook,
} from "@better-auth/core/context";
import type { InternalLogger } from "@better-auth/core/env";
import type { Session } from "../types";

/**
 * Sessions created during the current request that still need
 * `session.maxPerUser` enforced. `null` when nothing will enforce it.
 */
const pendingSessionLimits = defineRequestState<PendingSessionLimit[] | null>(
	() => null,
);

const toSeconds = (date: Date | string) =>
	Math.floor(new Date(date).getTime() / 1000);

/**
 * Keeps the user's newest `maxPerUser` sessions, counting `session`, and
 * revokes the rest. Impersonation sessions neither count nor get revoked.
 */
export async function revokeSessionsOverLimit(
	internalAdapter: InternalAdapter,
	session: Session,
	maxPerUser: number,
) {
	// Compared in whole seconds, since a database column may store no more.
	// Sessions created alongside `session` enforce the limit themselves, so
	// concurrent sign-ins never revoke each other.
	const createdAt = toSeconds(session.createdAt);
	const sessions = await internalAdapter.listSessions(session.userId, {
		onlyActiveSessions: true,
	});
	// `session` is left out and the limit reduced by one, so it is never
	// revoked, even when the list doesn't include it yet.
	const revokedTokens = sessions
		.filter(
			(s) =>
				s.id !== session.id &&
				s.token !== session.token &&
				!(s as Session & { impersonatedBy?: unknown }).impersonatedBy,
		)
		// Sessions read from secondary storage carry `createdAt` as a string.
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.slice(maxPerUser - 1)
		.filter((s) => toSeconds(s.createdAt) < createdAt)
		.map((s) => s.token);
	if (revokedTokens.length) {
		await internalAdapter.deleteSessions(revokedTokens);
	}
}

type PendingSessionLimit = {
	readonly token: string;
	readonly maxPerUser: number;
	readonly internalAdapter: InternalAdapter;
	readonly logger: InternalLogger;
};

/**
 * Defers `session.maxPerUser` enforcement for a session created during a
 * request to the end of that request, so it only applies to sessions the
 * request keeps. A sign-in that stops at a second factor, for example,
 * deletes its session and must not revoke the user's other sessions.
 *
 * @returns `false` when there is no request to defer to.
 */
export async function deferSessionLimit(pending: PendingSessionLimit) {
	if (!(await hasRequestState())) return false;
	const pendingLimits = await pendingSessionLimits.get();
	if (!pendingLimits) return false;
	pendingLimits.push(pending);
	return true;
}

/**
 * Runs a request and then enforces `session.maxPerUser` for the sessions it
 * created that still exist. Must be called where the request state is
 * created, so nested endpoint calls share it and the limit applies once.
 */
export async function runWithSessionLimits<T>(fn: () => Promise<T>) {
	const pendingLimits: PendingSessionLimit[] = [];
	await pendingSessionLimits.set(pendingLimits);
	try {
		return await fn();
	} finally {
		for (const {
			token,
			maxPerUser,
			internalAdapter,
			logger,
		} of pendingLimits) {
			await queueAfterTransactionHook(
				async () => {
					const current = await internalAdapter.findSession(token);
					if (!current) return;
					await revokeSessionsOverLimit(
						internalAdapter,
						current.session,
						maxPerUser,
					);
				},
				{
					onError(error: unknown) {
						logger.error(
							"Failed to revoke sessions over session.maxPerUser",
							error,
						);
					},
				},
			);
		}
	}
}

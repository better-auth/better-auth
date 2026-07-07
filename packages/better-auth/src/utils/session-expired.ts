import type { GenericEndpointContext } from "@better-auth/core";
import {
	defineRequestState,
	getCurrentAuthContext,
	hasRequestState,
} from "@better-auth/core/context";
import type { Session, User } from "@better-auth/core/db";
import { deleteSessionCookie } from "../cookies";

const notifiedSessionTokens = defineRequestState(() => new Set<string>());

/**
 * Returns whether a session's `expiresAt` is in the past.
 */
export function isSessionExpired(session: {
	expiresAt: Date | string | number;
}): boolean {
	const expiresAt = new Date(
		session.expiresAt as string | number | Date,
	).getTime();
	return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

async function shouldNotifySessionExpired(token: string): Promise<boolean> {
	if (!(await hasRequestState())) {
		return true;
	}

	const notified = await notifiedSessionTokens.get();
	if (notified.has(token)) {
		return false;
	}
	notified.add(token);
	return true;
}

/**
 * Invokes `session.onSessionExpired` from auth config. Does not mutate storage.
 */
export async function notifySessionExpired(
	ctx: GenericEndpointContext,
	data: { session: Session; user: User },
): Promise<void> {
	if (!(await shouldNotifySessionExpired(data.session.token))) {
		return;
	}

	const hook = ctx.context.options.session?.onSessionExpired;
	if (!hook) {
		return;
	}

	try {
		await ctx.context.runInBackgroundOrAwait(
			hook({ session: data.session, user: data.user }, ctx),
		);
	} catch (error) {
		ctx.context.logger.error("onSessionExpired hook failed", error);
	}
}

/**
 * Notifies when a session record has expired. Loads the user when only the
 * session row is available.
 */
export async function notifySessionExpiredIfNeeded(
	ctx: GenericEndpointContext,
	session: Session | null | undefined,
): Promise<void> {
	if (!session || !isSessionExpired(session)) {
		return;
	}

	const user = await ctx.context.internalAdapter.findUserById(session.userId);
	if (!user) {
		return;
	}

	await notifySessionExpired(ctx, { session, user });
}

/**
 * Notifies from adapter code paths that already have session and user loaded.
 */
export async function notifySessionExpiredFromFindSession(
	data: { session: Session; user: User } | null,
): Promise<void> {
	if (!data || !isSessionExpired(data.session)) {
		return;
	}

	const endpointCtx = await getCurrentAuthContext().catch(() => null);
	if (!endpointCtx) {
		return;
	}

	await notifySessionExpired(endpointCtx as GenericEndpointContext, data);
}

/**
 * Canonical expiry cleanup: notify via hook, clear cookies, optionally delete
 * from the session store.
 */
export async function handleExpiredSession(
	ctx: GenericEndpointContext,
	data: { session: Session; user: User },
	opts?: { deleteFromStore?: boolean },
): Promise<void> {
	await notifySessionExpired(ctx, data);
	deleteSessionCookie(ctx);
	if (opts?.deleteFromStore !== false) {
		await ctx.context.internalAdapter.deleteSession(data.session.token);
	}
}

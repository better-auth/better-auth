import type { AuthContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import type { Session, User } from "../types";

/**
 * Marks a context whose session was built by `$asUser` for this process.
 * An HTTP request cannot set a symbol, so it cannot supply an actor.
 */
export const actorSessionBrand = Symbol.for("better-auth.actor-session");

export type ActorSession = {
	session: Session;
	user: User;
};

export function readActorSession(context: unknown): ActorSession | null {
	if (!context || typeof context !== "object") return null;
	if (
		(context as { [actorSessionBrand]?: unknown })[actorSessionBrand] !== true
	) {
		return null;
	}
	const session = (context as { session?: ActorSession }).session;
	if (!session?.session || !session.user) return null;
	return session;
}

async function loadActor(
	ctx: AuthContext,
	userId: string,
): Promise<ActorSession> {
	const user = await ctx.internalAdapter.findUserById(userId);
	if (!user) {
		throw new APIError("BAD_REQUEST", { message: "User not found" });
	}
	const sessions = await ctx.internalAdapter.listSessions(userId, {
		onlyActiveSessions: true,
	});
	const session =
		sessions[0] ?? (await ctx.internalAdapter.createSession(userId));
	if (!session) {
		throw new APIError("BAD_REQUEST", { message: "User not found" });
	}
	return { session, user };
}

/**
 * Returns the same `auth.api` methods, running each call as `userId`.
 * Callers still go through permission checks. There is no HTTP route for this.
 */
export function withAsUser<API extends Record<string, unknown>>(
	api: API,
	authContext: AuthContext | Promise<AuthContext>,
): API & { $asUser: (userId: string) => API } {
	const asUser = (userId: string): API => {
		return new Proxy(api, {
			get(target, prop, receiver) {
				if (prop === "$asUser") return asUser;
				if (prop === "then" || prop === "catch" || prop === "finally") {
					return undefined;
				}
				const value: unknown = Reflect.get(target, prop, receiver);
				if (typeof value !== "function") return value;
				return async (input?: Record<string, unknown>) => {
					const ctx = await authContext;
					const actor = await loadActor(ctx, userId);
					return (
						value as (input?: Record<string, unknown>) => Promise<unknown>
					)({
						...input,
						headers: (input?.headers as Headers | undefined) ?? new Headers(),
						context: {
							...ctx,
							session: actor,
							[actorSessionBrand]: true,
						},
					});
				};
			},
		}) as API;
	};
	return Object.assign(api, { $asUser: asUser });
}

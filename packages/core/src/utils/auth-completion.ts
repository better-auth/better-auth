import type { AuthMiddleware } from "../api";
import type { BetterAuthPlugin, HookEndpointContext } from "../types/plugin";

const completionKey = Symbol.for("better-auth.internal.auth-completion");
const pendingSecondFactorUserKey = Symbol.for(
	"better-auth.internal.pending-second-factor-user",
);

/**
 * @internal A single consumer of the settled after-hook state.
 */
export type InternalAuthCompletion = {
	matcher: (context: HookEndpointContext) => boolean;
	handler: AuthMiddleware;
};

/**
 * @internal Register a first-party completion consumer without a public plugin hook.
 */
export function registerInternalAuthCompletion<T extends BetterAuthPlugin>(
	plugin: T,
	completion: InternalAuthCompletion,
): T {
	Object.defineProperty(plugin, completionKey, {
		value: completion,
	});
	return plugin;
}

/**
 * @internal Read the private completion registration during dispatch.
 */
export function getInternalAuthCompletion(
	plugin: BetterAuthPlugin,
): InternalAuthCompletion | null {
	const candidate: unknown = Reflect.get(plugin, completionKey);
	if (
		candidate &&
		typeof candidate === "object" &&
		"matcher" in candidate &&
		typeof candidate.matcher === "function" &&
		"handler" in candidate &&
		typeof candidate.handler === "function"
	) {
		return candidate as InternalAuthCompletion;
	}
	return null;
}

/**
 * @internal Carry only a challenged user's identity across the current dispatch.
 */
export function setPendingSecondFactorUser(
	context: object,
	userId: string,
): void {
	Reflect.set(context, pendingSecondFactorUserKey, userId);
}

/**
 * @internal A challenge marker does not represent an authenticated session.
 */
export function getPendingSecondFactorUser(context: object): string | null {
	const userId: unknown = Reflect.get(context, pendingSecondFactorUserKey);
	return typeof userId === "string" ? userId : null;
}

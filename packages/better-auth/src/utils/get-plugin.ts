import type { AuthContext, BetterAuthPlugin } from "../types";

export function getPlugin<P extends BetterAuthPlugin>(
	id: P["id"],
	context: AuthContext,
): P | undefined {
	return context.options.plugins?.find((p) => p.id === id) as P | undefined;
}

import type { AuthContext } from "../../types";
import { BetterAuthError } from "../../error";
import type { jwt } from "./index";

export const getJwtPlugin = (ctx: AuthContext) => {
	const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin as ReturnType<typeof jwt>;
};

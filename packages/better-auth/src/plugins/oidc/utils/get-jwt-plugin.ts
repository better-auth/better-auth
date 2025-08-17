import type { jwt } from "../../jwt";
import type { GenericEndpointContext } from "../../../types";

export const getJwtPlugin = (ctx: GenericEndpointContext) => {
	return ctx.context.options.plugins?.find(
		(plugin) => plugin.id === "jwt",
	) as ReturnType<typeof jwt>;
};

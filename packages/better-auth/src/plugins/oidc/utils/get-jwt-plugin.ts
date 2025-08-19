import type { jwt } from "../../jwt";
import type { GenericEndpointContext } from "../../../types";

import { APIError } from "../../../api";
import { logger } from "../../../utils";

export const getJwtPlugin = (ctx: GenericEndpointContext) => {
	const jwtPlugin = ctx.context.options.plugins?.find(
		(plugin) => plugin.id === "jwt",
	);

	if (!jwtPlugin) {
		logger.error("could not find JWT plugin");
		throw new APIError("INTERNAL_SERVER_ERROR");
	}

	return jwtPlugin as ReturnType<typeof jwt>;
};

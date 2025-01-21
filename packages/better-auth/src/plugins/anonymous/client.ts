import { ANONYMOUS_ERROR_CODES, type anonymous } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const anonymousClient = () => {
	return {
		id: "anonymous",
		$InferServerPlugin: {} as ReturnType<typeof anonymous>,
		pathMethods: {
			"/sign-in/anonymous": "POST",
		},
		$ERROR_CODES: ANONYMOUS_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

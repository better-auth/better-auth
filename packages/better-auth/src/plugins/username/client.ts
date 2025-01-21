import { USERNAME_ERROR_CODES, type username } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
		$ERROR_CODES: USERNAME_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

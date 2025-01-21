import { ADMIN_ERROR_CODES, type admin } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const adminClient = () => {
	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof admin>,
		pathMethods: {
			"/admin/list-users": "GET",
			"/admin/stop-impersonating": "POST",
		},
		$ERROR_CODES: ADMIN_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

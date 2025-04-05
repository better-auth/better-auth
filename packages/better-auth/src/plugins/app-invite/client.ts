import type { appInvite } from ".";
import type { BetterAuthClientPlugin } from "../../types";
import type { AppInvitation } from "./schema";

export const appInviteClient = <
	O extends {
		$Infer?: {
			/**
			 * Infer additional fields for the user
			 */
			AdditionalFields?: Record<string, any>;
		};
	},
>(
	options?: O,
) => {
	return {
		id: "app-invite",
		$InferServerPlugin: {} as ReturnType<typeof appInvite<O>>,
		getActions: ($fetch) => ({
			$Infer: {
				AppInvitation: {} as AppInvitation,
			},
		}),
		pathMethods: {
			"/invite-user": "POST",
			"/accept-invitation": "POST",
			"/reject-invitation": "POST",
			"/cancel-invitation": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

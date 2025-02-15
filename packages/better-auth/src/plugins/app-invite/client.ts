import type { appInvite } from ".";
import type { BetterAuthClientPlugin } from "../../types";

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
	} satisfies BetterAuthClientPlugin;
};
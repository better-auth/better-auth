import type { BetterAuthClientPlugin } from "../../client/types";
import type { BetterAuthPlugin } from "../../types";

type UsernamePlugin<RequiredUsername extends boolean = false> =
	BetterAuthPlugin & {
		schema: {
			user: {
				fields: {
					username: {
						type: "string";
						required: RequiredUsername;
						sortable: true;
						unique: true;
						returned: true;
					};
					displayUsername: {
						type: "string";
						required: false;
					};
				};
			};
		};
	};

export const usernameClient = <
	O extends {
		/**
		 * Whether the username is required when signing up
		 *
		 * @default false
		 */
		requiredUsername?: boolean;
	} = {},
>(
	options?: O,
) => {
	return {
		id: "username",
		$InferServerPlugin: {} as O["requiredUsername"] extends true
			? UsernamePlugin<true>
			: UsernamePlugin<false>,
	} satisfies BetterAuthClientPlugin;
};

import type { username } from ".";
import { createClientPlugin } from "../../client/create-client-plugin";

export const usernameClient = createClientPlugin<ReturnType<typeof username>>()(
	($fetch) => {
		return {
			id: "username",
		};
	},
);

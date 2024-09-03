import type { username } from ".";
import type { AuthClientPlugin } from "../../client/types";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
	} satisfies AuthClientPlugin;
};

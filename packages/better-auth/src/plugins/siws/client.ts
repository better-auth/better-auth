import type { siws } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const siwsClient = () => {
	return {
		id: "siws",
		$InferServerPlugin: {} as ReturnType<typeof siws>,
	} satisfies BetterAuthClientPlugin;
};

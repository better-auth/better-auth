import type { BetterAuthClientPlugin } from "../../types";

export const bearerClient = () => {
	return {
		id: "bearer",
		getActions($fetch, $store, options) {
			if (typeof document === "undefined") return {};
			const cookie = document.cookie;
			if (cookie.includes("bearer-token=true")) {
				// This will hit the endpoint which would grab the bearer token cookie if it exists, then delete said cookie
				// It will then return the bearer token in the response which should be caught on the authClient's `onSuccess` hook
				$fetch("/get-bearer-token");
			}
			return {};
		},
	} satisfies BetterAuthClientPlugin;
};
 
import type { BetterAuthClientPlugin } from "../../types";

export type BearerClientOptions = {
	/**
	 * Custom cookie name for the temporary bearer token confirmation cookie.
	 *
	 * @default "bearer-token-confirmation"
	 */
	cookieName?: string;
};

export const bearerClient = (options?: BearerClientOptions) => {
	return {
		id: "bearer",
		getActions($fetch) {
			if (typeof document === "undefined") return {};
			const cookie = document.cookie;
			const cookieName = options?.cookieName || "bearer-token-confirmation";
			if (cookie.includes(`${cookieName}=true`)) {
				// This will hit the endpoint which would grab the bearer token cookie if it exists, then delete said cookie
				// It will then return the bearer token in the response which should be caught on the authClient's `onSuccess` hook
				$fetch("/get-bearer-token");
			}
			return {};
		},
	} satisfies BetterAuthClientPlugin;
};

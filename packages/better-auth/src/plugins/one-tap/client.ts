import type { BetterFetchOption } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "../../types";

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize: (config: any) => void;
					prompt: () => void;
				};
			};
		};
		googleScriptInitialized?: boolean;
	}
}

export interface GoogleOneTapOptions {
	/**
	 * Google client ID
	 */
	clientId: string;
	/**
	 * Auto select the account if the user is already signed in
	 */
	autoSelect?: boolean;
	/**
	 * Cancel the flow when the user taps outside the prompt
	 */
	cancelOnTapOutside?: boolean;
	/**
	 * Context of the Google One Tap flow
	 */
	context?: "signin" | "signup" | "use";
}

export interface GoogleOneTapActionOptions
	extends Omit<GoogleOneTapOptions, "clientId"> {
	fetchOptions?: BetterFetchOption;
	callbackURL?: string;
}

let isRequestInProgress = false;

export const oneTapClient = (options: GoogleOneTapOptions) => {
	return {
		id: "one-tap",
		getActions: ($fetch, _) => ({
			oneTap: async (
				opts?: GoogleOneTapActionOptions,
				fetchOptions?: BetterFetchOption,
			) => {
				if (isRequestInProgress) {
					console.warn(
						"A Google One Tap request is already in progress. Please wait.",
					);
					return;
				}

				isRequestInProgress = true;

				try {
					if (typeof window === "undefined" || !window.document) {
						console.warn(
							"Google One Tap is only available in browser environments",
						);
						return;
					}

					const { autoSelect, cancelOnTapOutside, context } = opts ?? {};
					const contextValue = context ?? options.context ?? "signin";

					await loadGoogleScript();

					await new Promise<void>((resolve) => {
						window.google?.accounts.id.initialize({
							client_id: options.clientId,
							callback: async (response: { credential: string }) => {
								await $fetch("/one-tap/callback", {
									method: "POST",
									body: { idToken: response.credential },
									...opts?.fetchOptions,
									...fetchOptions,
								});

								// Redirect if no fetch options are provided or a callbackURL is specified
								if (
									(!opts?.fetchOptions && !fetchOptions) ||
									opts?.callbackURL
								) {
									window.location.href = opts?.callbackURL ?? "/";
								}
								resolve();
							},
							auto_select: autoSelect,
							cancel_on_tap_outside: cancelOnTapOutside,
							context: contextValue,
						});
						window.google?.accounts.id.prompt();
					});
				} catch (error) {
					console.error("Error during Google One Tap flow:", error);
					throw error;
				} finally {
					isRequestInProgress = false;
				}
			},
		}),
		getAtoms($fetch) {
			return {};
		},
	} satisfies BetterAuthClientPlugin;
};

const loadGoogleScript = (): Promise<void> => {
	return new Promise((resolve) => {
		if (window.googleScriptInitialized) {
			resolve();
			return;
		}

		const script = document.createElement("script");
		script.src = "https://accounts.google.com/gsi/client";
		script.async = true;
		script.defer = true;
		script.onload = () => {
			window.googleScriptInitialized = true;
			resolve();
		};
		document.head.appendChild(script);
	});
};

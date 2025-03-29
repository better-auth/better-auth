import type { BetterFetchOption } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "../../types";

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize: (config: any) => void;
					prompt: (callback?: (notification: any) => void) => void;
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
	 * The mode to use for the Google One Tap flow
	 *
	 * popup: Use a popup window
	 * redirect: Redirect the user to the Google One Tap flow
	 *
	 * @default "popup"
	 */
	uxMode?: "popup" | "redirect";
	/**
	 * The context to use for the Google One Tap flow. See https://developers.google.com/identity/gsi/web/reference/js-reference
	 *
	 * @default "signin"
	 */
	context?: "signin" | "signup" | "use";
	/**
	 * Additional configuration options to pass to the Google One Tap API.
	 */
	additionalOptions?: Record<string, any>;
	/**
	 * Configuration options for the prompt and exponential backoff behavior.
	 */
	promptOptions?: {
		/**
		 * Base delay (in milliseconds) for exponential backoff.
		 * @default 1000
		 */
		baseDelay?: number;
		/**
		 * Maximum number of prompt attempts before calling onPromptNotification.
		 * @default 5
		 */
		maxAttempts?: number;
	};
}

export interface GoogleOneTapActionOptions
	extends Omit<GoogleOneTapOptions, "clientId" | "promptOptions"> {
	fetchOptions?: BetterFetchOption;
	/**
	 * Callback URL.
	 */
	callbackURL?: string;
	/**
	 * Optional callback that receives the prompt notification if (or when) the prompt is dismissed or skipped.
	 * This lets you render an alternative UI (e.g. a Google Sign-In button) to restart the process.
	 */
	onPromptNotification?: (notification: any) => void;
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

					await new Promise<void>((resolve, reject) => {
						let isResolved = false;
						const baseDelay = options.promptOptions?.baseDelay ?? 1000;
						const maxAttempts = options.promptOptions?.maxAttempts ?? 5;

						window.google?.accounts.id.initialize({
							client_id: options.clientId,
							callback: async (response: { credential: string }) => {
								isResolved = true;
								try {
									await $fetch("/one-tap/callback", {
										method: "POST",
										body: { idToken: response.credential },
										...opts?.fetchOptions,
										...fetchOptions,
									});

									if (
										(!opts?.fetchOptions && !fetchOptions) ||
										opts?.callbackURL
									) {
										window.location.href = opts?.callbackURL ?? "/";
									}
									resolve();
								} catch (error) {
									console.error("Error during One Tap callback:", error);
									reject(error);
								}
							},
							auto_select: autoSelect,
							cancel_on_tap_outside: cancelOnTapOutside,
							context: contextValue,

							...options.additionalOptions,
						});

						const handlePrompt = (attempt: number) => {
							if (isResolved) return;

							window.google?.accounts.id.prompt((notification: any) => {
								if (isResolved) return;

								if (
									notification.isDismissedMoment &&
									notification.isDismissedMoment()
								) {
									if (attempt < maxAttempts) {
										const delay = Math.pow(2, attempt) * baseDelay;
										setTimeout(() => handlePrompt(attempt + 1), delay);
									} else {
										opts?.onPromptNotification?.(notification);
									}
								} else if (
									notification.isSkippedMoment &&
									notification.isSkippedMoment()
								) {
									if (attempt < maxAttempts) {
										const delay = Math.pow(2, attempt) * baseDelay;
										setTimeout(() => handlePrompt(attempt + 1), delay);
									} else {
										opts?.onPromptNotification?.(notification);
									}
								}
							});
						};

						handlePrompt(0);
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

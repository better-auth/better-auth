import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
} from "@better-auth/core";

declare global {
	interface Window {
		google?:
			| {
					accounts: {
						id: {
							initialize: (config: any) => void;
							prompt: (callback?: (notification: any) => void) => void;
						};
					};
			  }
			| undefined;
		googleScriptInitialized?: boolean | undefined;
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
	autoSelect?: boolean | undefined;
	/**
	 * Cancel the flow when the user taps outside the prompt
	 */
	cancelOnTapOutside?: boolean | undefined;
	/**
	 * The mode to use for the Google One Tap flow
	 *
	 * popup: Use a popup window
	 * redirect: Redirect the user to the Google One Tap flow
	 *
	 * @default "popup"
	 */
	uxMode?: ("popup" | "redirect") | undefined;
	/**
	 * The context to use for the Google One Tap flow.
	 *
	 * @see {@link https://developers.google.com/identity/gsi/web/reference/js-reference}
	 * @default "signin"
	 */
	context?: ("signin" | "signup" | "use") | undefined;
	/**
	 * Additional configuration options to pass to the Google One Tap API.
	 */
	additionalOptions?: Record<string, any> | undefined;
	/**
	 * Configuration options for the prompt and exponential backoff behavior.
	 */
	promptOptions?:
		| {
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
				/**
				 * Whether to support FedCM (Federated Credential Management) support.
				 *
				 * @see {@link https://developer.chrome.com/docs/identity/fedcm/overview}
				 * @default true
				 */
				fedCM?: boolean | undefined;
		  }
		| undefined;
}

export interface GoogleOneTapActionOptions
	extends Omit<GoogleOneTapOptions, "clientId" | "promptOptions"> {
	fetchOptions?: ClientFetchOption | undefined;
	/**
	 * Callback URL.
	 */
	callbackURL?: string | undefined;
	/**
	 * Optional callback that receives the prompt notification if (or when) the prompt is dismissed or skipped.
	 * This lets you render an alternative UI (e.g. a Google Sign-In button) to restart the process.
	 */
	onPromptNotification?: ((notification?: any | undefined) => void) | undefined;
	nonce?: string | undefined;
}

interface IdentityCredential {
	readonly configURL: string;
	readonly isAutoSelected: boolean;
	token: string;
}

let isRequestInProgress: AbortController | null = null;

function isFedCMSupported() {
	return typeof window !== "undefined" && "IdentityCredential" in window;
}

export const oneTapClient = (options: GoogleOneTapOptions) => {
	return {
		id: "one-tap",
		fetchPlugins: [
			{
				id: "fedcm-signout-handle",
				name: "FedCM Sign-Out Handler",
				hooks: {
					async onResponse(ctx) {
						if (!ctx.request.url.toString().includes("/sign-out")) {
							return;
						}
						if (options.promptOptions?.fedCM === false || !isFedCMSupported()) {
							return;
						}
						navigator.credentials.preventSilentAccess();
					},
				},
			},
		],
		getActions: ($fetch, _) => {
			return {
				oneTap: async (
					opts?: GoogleOneTapActionOptions | undefined,
					fetchOptions?: ClientFetchOption | undefined,
				) => {
					if (isRequestInProgress && !isRequestInProgress.signal.aborted) {
						console.warn(
							"A Google One Tap request is already in progress. Please wait.",
						);
						return;
					}

					if (typeof window === "undefined" || !window.document) {
						console.warn(
							"Google One Tap is only available in browser environments",
						);
						return;
					}

					async function callback(idToken: string) {
						await $fetch("/one-tap/callback", {
							method: "POST",
							body: { idToken },
							...opts?.fetchOptions,
							...fetchOptions,
						});

						if ((!opts?.fetchOptions && !fetchOptions) || opts?.callbackURL) {
							window.location.href = opts?.callbackURL ?? "/";
						}
					}

					const { autoSelect, cancelOnTapOutside, context } = opts ?? {};
					const contextValue = context ?? options.context ?? "signin";
					const clients = {
						fedCM: async () => {
							try {
								const identityCredential = (await navigator.credentials.get({
									identity: {
										context: contextValue,
										providers: [
											{
												configURL: "https://accounts.google.com/gsi/fedcm.json",
												clientId: options.clientId,
												nonce: opts?.nonce,
											},
										],
									},
									mediation: autoSelect ? "optional" : "required",
									signal: isRequestInProgress?.signal,
								} as any)) as IdentityCredential | null;

								if (!identityCredential?.token) {
									// Notify the caller that the prompt resulted in no token.
									opts?.onPromptNotification?.(undefined);
									return;
								}

								try {
									await callback(identityCredential.token);
									return;
								} catch (error) {
									console.error("Error during FedCM callback:", error);
									throw error;
								}
							} catch (error: any) {
								if (error?.code && (error.code === 19 || error.code === 20)) {
									// Notify the caller that the prompt was closed/dismissed.
									opts?.onPromptNotification?.(undefined);
									return;
								}
								throw error;
							}
						},
						oneTap: () => {
							return new Promise<void>((resolve, reject) => {
								let isResolved = false;
								const baseDelay = options.promptOptions?.baseDelay ?? 1000;
								const maxAttempts = options.promptOptions?.maxAttempts ?? 5;

								window.google?.accounts.id.initialize({
									client_id: options.clientId,
									callback: async (response: { credential: string }) => {
										isResolved = true;
										try {
											await callback(response.credential);
											resolve();
										} catch (error) {
											console.error("Error during One Tap callback:", error);
											reject(error);
										}
									},
									auto_select: autoSelect,
									cancel_on_tap_outside: cancelOnTapOutside,
									context: contextValue,
									ux_mode: opts?.uxMode || "popup",
									nonce: opts?.nonce,
									/**
									 * @see {@link https://developers.google.com/identity/gsi/web/guides/overview}
									 */
									itp_support: true,

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
						},
					};

					if (isRequestInProgress) {
						isRequestInProgress?.abort();
					}
					isRequestInProgress = new AbortController();

					try {
						const client =
							options.promptOptions?.fedCM === false || !isFedCMSupported()
								? "oneTap"
								: "fedCM";
						if (client === "oneTap") {
							await loadGoogleScript();
						}

						await clients[client]();
					} catch (error) {
						console.error("Error during Google One Tap flow:", error);
						throw error;
					} finally {
						isRequestInProgress = null;
					}
				},
			};
		},
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

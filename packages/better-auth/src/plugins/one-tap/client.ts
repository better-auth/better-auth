/// <reference types="@types/google.accounts" />
import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
} from "@better-auth/core";

declare global {
	interface Window {
		googleScriptInitialized?: boolean | undefined;
	}
}

export interface GsiButtonConfiguration {
	/**
	 * The button type: icon, or standard button.
	 */
	type: "standard" | "icon";

	/**
	 * The button theme. For example, filled_blue or filled_black.
	 * outline  A standard button theme:
	 * filled_blue  A blue-filled button theme:
	 * filled_black  A black-filled button theme:
	 */
	theme?: "outline" | "filled_blue" | "filled_black";

	/**
	 * The button size. For example, small or large.
	 */
	size?: "small" | "medium" | "large";

	/**
	 * The button text. The default value is signin_with.
	 * There are no visual differences for the text of icon buttons that
	 * have different text attributes. The only exception is when the
	 * text is read for screen accessibility.
	 *
	 * signin_with  The button text is “Sign in with Google”:
	 * signup_with  The button text is “Sign up with Google”:
	 * continue_with  The button text is “Continue with Google”:
	 * signup_with  The button text is “Sign in”:
	 */
	text?: "signin_with" | "signup_with" | "continue_with" | "signin";

	/**
	 * The button shape. The default value is rectangular.
	 */
	shape?: "rectangular" | "pill" | "circle" | "square";

	/**
	 * The alignment of the Google logo. The default value is left.
	 * This attribute only applies to the standard button type.
	 */
	logo_alignment?: "left" | "center";

	/**
	 * The minimum button width, in pixels. The maximum width is 400
	 * pixels.
	 */
	width?: number;

	/**
	 * The pre-set locale of the button text. If it's not set, the
	 * browser's default locale or the Google session user’s preference
	 * is used.
	 */
	locale?: string;

	/**
	 * You can define a JavaScript function to be called when the
	 * Sign in with Google button is clicked.
	 */
	click_listener?: () => void;

	/**
	 * Optional, as multiple Sign in with Google buttons can be
	 * rendered on the same page, you can assign each button with a
	 * unique string. The same string would return along with the ID
	 * token, so you can identify which button user clicked to sign in.
	 */
	state?: string;
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
	 *
	 * Note: To use this option, disable `promptOptions.fedCM`
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
	/**
	 * Button mode configuration. When provided, renders a "Sign In with Google" button
	 * instead of showing the One Tap prompt.
	 */
	button?:
		| {
				/**
				 * The HTML element or CSS selector where the button should be rendered.
				 * If a string is provided, it will be used as a CSS selector.
				 */
				container: HTMLElement | string;
				/**
				 * Button configuration options
				 */
				config?: GsiButtonConfiguration | undefined;
		  }
		| undefined;
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

/**
 * Reasons that should NOT trigger a retry.
 * @see https://developers.google.com/identity/gsi/web/reference/js-reference
 */
const noRetryReasons = {
	dismissed: ["credential_returned", "cancel_called"],
	skipped: ["user_cancel", "tap_outside"],
} as const;

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

					// Button mode: render a button instead of showing the prompt
					if (opts?.button) {
						await loadGoogleScript();

						const container =
							typeof opts.button.container === "string"
								? document.querySelector<HTMLElement>(opts.button.container)
								: opts.button.container;

						if (!container) {
							console.error(
								"Google One Tap: Button container not found",
								opts.button.container,
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

						window.google?.accounts.id.initialize({
							client_id: options.clientId,
							callback: async (response: { credential: string }) => {
								try {
									await callback(response.credential);
								} catch (error) {
									console.error("Error during button callback:", error);
								}
							},
							auto_select: autoSelect,
							cancel_on_tap_outside: cancelOnTapOutside,
							context: contextValue,
							ux_mode: opts?.uxMode || "popup",
							nonce: opts?.nonce,
							itp_support: true,
							...options.additionalOptions,
						});

						window.google?.accounts.id.renderButton(
							container,
							opts.button.config ?? {
								type: "icon",
							},
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
											const reason = notification.getDismissedReason?.();
											if (noRetryReasons.dismissed.includes(reason)) {
												opts?.onPromptNotification?.(notification);
												return;
											}
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
											const reason = notification.getSkippedReason?.();
											if (noRetryReasons.skipped.includes(reason)) {
												opts?.onPromptNotification?.(notification);
												return;
											}
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

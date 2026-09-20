/// <reference types="@types/google.accounts" />
import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	ClientFetchOption,
	ClientStore,
} from "@better-auth/core";
import { isSafeUrlScheme } from "@better-auth/core/utils/url";
import type { BetterFetch } from "@better-fetch/fetch";
import { PACKAGE_VERSION } from "../../version";

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
	/**
	 * @deprecated Better Auth generates a server-bound nonce for each One Tap
	 * attempt. This value is ignored and should be removed.
	 */
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

let isRequestInProgress = false;

type OneTapNonceAttempt = {
	nonce: string;
	expiresIn: number;
};

const buttonNonceRefreshTimers = new WeakMap<
	HTMLElement,
	ReturnType<typeof setTimeout>
>();

function clearButtonNonceRefreshTimer(container: HTMLElement): void {
	const timer = buttonNonceRefreshTimers.get(container);
	if (timer !== undefined) {
		clearTimeout(timer);
		buttonNonceRefreshTimers.delete(container);
	}
}

function getButtonNonceRefreshDelayMs(expiresIn: number): number {
	return Math.max(0, Math.floor(expiresIn * 900));
}

const BUTTON_NONCE_RETRY_BASE_DELAY_MS = 1000;
const BUTTON_NONCE_RETRY_MAX_DELAY_MS = 30_000;

/**
 * A rendered button is unusable once its nonce expires or is consumed, so a
 * failed refresh has to be retried rather than dropped: otherwise every later
 * click is rejected until application code calls `oneTap()` again.
 */
function getButtonNonceRetryDelayMs(attempt: number): number {
	return Math.min(
		BUTTON_NONCE_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
		BUTTON_NONCE_RETRY_MAX_DELAY_MS,
	);
}

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
		version: PACKAGE_VERSION,
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
		getActions: (
			$fetch: BetterFetch,
			_$store: ClientStore,
			_options: BetterAuthClientOptions | undefined,
		) => {
			return {
				oneTap: async (
					opts?: GoogleOneTapActionOptions | undefined,
					fetchOptions?: ClientFetchOption | undefined,
				) => {
					if (isRequestInProgress) {
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

					const { nonce: _nonce, ...additionalOptions } =
						options.additionalOptions ?? {};

					const getServerNonce = async (): Promise<OneTapNonceAttempt> => {
						const nonceFetchOptions = {
							...opts?.fetchOptions,
							...fetchOptions,
							onSuccess: undefined,
							onError: undefined,
						};
						const response = await $fetch("/one-tap/nonce", {
							...nonceFetchOptions,
							method: "POST",
							throw: false,
						});
						const data = response.data as {
							nonce?: unknown;
							expiresIn?: unknown;
						} | null;
						const nonce = data?.nonce;
						const expiresIn = data?.expiresIn;
						if (
							response.error ||
							typeof nonce !== "string" ||
							typeof expiresIn !== "number" ||
							!Number.isFinite(expiresIn) ||
							expiresIn <= 0
						) {
							throw new Error("Failed to create a Google One Tap nonce.");
						}
						return { nonce, expiresIn };
					};

					// Button mode: render a button instead of showing the prompt
					if (opts?.button) {
						try {
							await loadGoogleScript();
						} catch (error) {
							console.error("Error initializing Google One Tap:", error);
							return;
						}

						const resolvedContainer =
							typeof opts.button.container === "string"
								? document.querySelector<HTMLElement>(opts.button.container)
								: opts.button.container;

						if (!resolvedContainer) {
							console.error(
								"Google One Tap: Button container not found",
								opts.button.container,
							);
							return;
						}

						// Annotated so the hoisted helpers below see the non-null type;
						// narrowing does not reach into a function declaration.
						const container: HTMLElement = resolvedContainer;
						const isContainerDetached = () => container.isConnected === false;

						clearButtonNonceRefreshTimer(container);
						const buttonConfig = opts.button.config ?? {
							type: "icon",
						};
						let isButtonRequestInProgress = false;
						let buttonRefreshInFlight: Promise<void> | null = null;

						async function callback(idToken: string) {
							const res = await $fetch("/one-tap/callback", {
								method: "POST",
								body: {
									idToken,
									callbackURL: opts?.callbackURL,
								},
								...opts?.fetchOptions,
								...fetchOptions,
							});

							// The server validates callbackURL against trustedOrigins; do
							// not navigate if it rejected the request.
							if (res?.error) {
								return;
							}

							if ((!opts?.fetchOptions && !fetchOptions) || opts?.callbackURL) {
								const target = opts?.callbackURL ?? "/";
								if (isSafeUrlScheme(target)) {
									window.location.href = target;
								}
							}
						}

						const { autoSelect, cancelOnTapOutside, context } = opts ?? {};
						const contextValue = context ?? options.context ?? "signin";

						const useFedCM = options.promptOptions?.fedCM !== false;
						const renderButton = (attempt: OneTapNonceAttempt) => {
							const googleIdentity = window.google?.accounts.id;
							if (!googleIdentity) {
								throw new Error("Google One Tap is not available.");
							}

							googleIdentity.initialize({
								client_id: options.clientId,
								callback: async (response: { credential: string }) => {
									if (isButtonRequestInProgress) {
										return;
									}

									isButtonRequestInProgress = true;
									clearButtonNonceRefreshTimer(container);
									try {
										await callback(response.credential);
									} catch (error) {
										console.error("Error during button callback:", error);
									} finally {
										isButtonRequestInProgress = false;
										try {
											await refreshButton();
										} catch (error) {
											console.error(
												"Error refreshing Google One Tap button:",
												error,
											);
											// The nonce just used is consumed, so without a
											// retry the button would reject every later click.
											scheduleButtonNonceRefresh(
												getButtonNonceRetryDelayMs(1),
												1,
											);
										}
									}
								},
								auto_select: autoSelect,
								cancel_on_tap_outside: cancelOnTapOutside,
								context: contextValue,
								ux_mode: opts?.uxMode || "popup",
								itp_support: true,
								use_fedcm_for_prompt: useFedCM,
								...additionalOptions,
								nonce: attempt.nonce,
							});

							container.replaceChildren();
							googleIdentity.renderButton(container, buttonConfig);

							scheduleButtonNonceRefresh(
								getButtonNonceRefreshDelayMs(attempt.expiresIn),
							);
						};

						function scheduleButtonNonceRefresh(delayMs: number, retry = 0) {
							clearButtonNonceRefreshTimer(container);
							const refreshTimer = setTimeout(() => {
								buttonNonceRefreshTimers.delete(container);
								if (isContainerDetached()) {
									return;
								}
								if (isButtonRequestInProgress) {
									// The credential callback refreshes once it settles;
									// check back instead of dropping the timer, which would
									// leave the button on a nonce that is about to expire.
									scheduleButtonNonceRefresh(
										BUTTON_NONCE_RETRY_BASE_DELAY_MS,
										retry,
									);
									return;
								}
								void refreshButton().catch((error) => {
									console.error(
										"Error refreshing Google One Tap button:",
										error,
									);
									if (isContainerDetached()) {
										return;
									}
									const nextRetry = retry + 1;
									scheduleButtonNonceRefresh(
										getButtonNonceRetryDelayMs(nextRetry),
										nextRetry,
									);
								});
							}, delayMs);
							buttonNonceRefreshTimers.set(container, refreshTimer);
						}

						function refreshButton(): Promise<void> {
							// Collapse overlapping refreshes so a scheduled refresh and a
							// post-credential refresh cannot render the button twice, with
							// the slower response clobbering the newer nonce.
							buttonRefreshInFlight ??= (async () => {
								if (isContainerDetached()) {
									return;
								}
								const attempt = await getServerNonce();
								if (isContainerDetached()) {
									return;
								}
								renderButton(attempt);
							})().finally(() => {
								buttonRefreshInFlight = null;
							});
							return buttonRefreshInFlight;
						}

						try {
							await refreshButton();
						} catch (error) {
							console.error("Error initializing Google One Tap:", error);
							scheduleButtonNonceRefresh(getButtonNonceRetryDelayMs(1), 1);
						}

						return;
					}

					async function callback(idToken: string) {
						const res = await $fetch("/one-tap/callback", {
							method: "POST",
							body: {
								idToken,
								callbackURL: opts?.callbackURL,
							},
							...opts?.fetchOptions,
							...fetchOptions,
						});

						// The server validates callbackURL against trustedOrigins; do
						// not navigate if it rejected the request.
						if (res?.error) {
							return;
						}

						if ((!opts?.fetchOptions && !fetchOptions) || opts?.callbackURL) {
							const target = opts?.callbackURL ?? "/";
							if (isSafeUrlScheme(target)) {
								window.location.href = target;
							}
						}
					}

					const { autoSelect, cancelOnTapOutside, context } = opts ?? {};
					const contextValue = context ?? options.context ?? "signin";
					isRequestInProgress = true;

					try {
						const { nonce } = await getServerNonce();
						await loadGoogleScript();
						await new Promise<void>((resolve, reject) => {
							let isResolved = false;
							const baseDelay = options.promptOptions?.baseDelay ?? 1000;
							const maxAttempts = options.promptOptions?.maxAttempts ?? 5;

							const useFedCM = options.promptOptions?.fedCM !== false;
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
								/**
								 * @see {@link https://developers.google.com/identity/gsi/web/guides/overview}
								 */
								itp_support: true,
								use_fedcm_for_prompt: useFedCM,
								...additionalOptions,
								nonce,
							});

							const handlePrompt = (attempt: number) => {
								if (isResolved) return;

								window.google?.accounts.id.prompt((notification: any) => {
									if (isResolved) return;

									if (notification.isDismissedMoment?.()) {
										const reason = notification.getDismissedReason?.();
										if (noRetryReasons.dismissed.includes(reason)) {
											opts?.onPromptNotification?.(notification);
											resolve();
											return;
										}
										if (attempt < maxAttempts) {
											const delay = Math.pow(2, attempt) * baseDelay;
											setTimeout(() => handlePrompt(attempt + 1), delay);
										} else {
											opts?.onPromptNotification?.(notification);
											resolve();
										}
									} else if (notification.isSkippedMoment?.()) {
										// Under FedCM, getSkippedReason() is not available.
										// Treat missing reason the same as a no-retry reason.
										const reason = notification.getSkippedReason?.();
										if (!reason || noRetryReasons.skipped.includes(reason)) {
											opts?.onPromptNotification?.(notification);
											resolve();
											return;
										}
										if (attempt < maxAttempts) {
											const delay = Math.pow(2, attempt) * baseDelay;
											setTimeout(() => handlePrompt(attempt + 1), delay);
										} else {
											opts?.onPromptNotification?.(notification);
											resolve();
										}
									} else if (notification.isNotDisplayed?.()) {
										// Under FedCM, isNotDisplayed() is deprecated.
										// Still handle it for non-FedCM fallback.
										opts?.onPromptNotification?.(notification);
										resolve();
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
			};
		},
		getAtoms($fetch) {
			return {};
		},
	} satisfies BetterAuthClientPlugin;
};

const loadGoogleScript = (): Promise<void> => {
	return new Promise((resolve, reject) => {
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
		script.onerror = () => {
			reject(new Error("Failed to load Google Identity Services script"));
		};
		document.head.appendChild(script);
	});
};

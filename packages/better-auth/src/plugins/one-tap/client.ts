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
	 * Note: This may have no effect, as FedCM lets the browser manage dismissal
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
	 * Fetch a single-use nonce from `/id-token/nonce` before each prompt and
	 * button render, pass it to Google, and send it with the ID token. Enable it
	 * together with `requireIssuedIdTokenNonce` on the server's
	 * `socialProviders.google`.
	 *
	 * @default false
	 */
	useIssuedNonce?: boolean | undefined;
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
				 * Whether to call `navigator.credentials.preventSilentAccess()` on
				 * sign-out to clear the browser's FedCM credential state. FedCM for
				 * the prompt itself is managed by Google and cannot be disabled.
				 *
				 * @see {@link https://developer.chrome.com/docs/identity/fedcm/overview}
				 * @default true
				 */
				fedCM?: boolean | undefined;
		  }
		| undefined;
}

export interface GoogleOneTapActionOptions
	extends Omit<
		GoogleOneTapOptions,
		"clientId" | "promptOptions" | "useIssuedNonce"
	> {
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
	 * @deprecated Ignored. A nonce the app chooses gives the server nothing to
	 * check. Set `useIssuedNonce` on `oneTapClient` instead.
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
				/**
				 * Open the browser's FedCM account chooser when the button is
				 * clicked, instead of Google's popup window. `autoSelect` then
				 * signs in a returning user without showing the chooser.
				 *
				 * Applies on Chrome 125+ on desktop and Chrome 128+ on Android.
				 * Other browsers keep the popup.
				 *
				 * @see {@link https://developers.google.com/identity/gsi/web/guides/fedcm-migration}
				 * @default false
				 */
				fedCM?: boolean | undefined;
		  }
		| undefined;
}

let isRequestInProgress = false;

// Issued nonces expire after five minutes; refresh a rendered button before then.
const BUTTON_NONCE_REFRESH_MS = 4 * 60 * 1000;
const BUTTON_NONCE_RETRY_MS = 10 * 1000;
// One refresh chain per container, so several live buttons each keep a fresh nonce.
const buttonRefreshTimers = new WeakMap<
	HTMLElement,
	ReturnType<typeof setTimeout>
>();

function isFedCMSupported() {
	return typeof window !== "undefined" && "IdentityCredential" in window;
}

/**
 * Reasons that should NOT trigger a retry.
 * @see https://developers.google.com/identity/gsi/web/reference/js-reference
 */
const noRetryReasons = {
	dismissed: ["credential_returned", "cancel_called"],
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

					if (opts?.nonce !== undefined) {
						console.warn(
							"Google One Tap: the `nonce` option is ignored. Set `useIssuedNonce` to bind sign-ins to a server-issued nonce.",
						);
					}

					/** Returns whether it navigated away. */
					async function callback(idToken: string, nonce: string | undefined) {
						const res = await $fetch("/one-tap/callback", {
							method: "POST",
							body: { idToken, nonce, callbackURL: opts?.callbackURL },
							...opts?.fetchOptions,
							...fetchOptions,
						});

						// The server validates callbackURL against trustedOrigins; do
						// not navigate if it rejected the request.
						if (res?.error) {
							return false;
						}

						if ((!opts?.fetchOptions && !fetchOptions) || opts?.callbackURL) {
							const target = opts?.callbackURL ?? "/";
							if (isSafeUrlScheme(target)) {
								window.location.href = target;
								return true;
							}
						}
						return false;
					}

					// The app's fetchOptions belong to the callback (e.g. a redirect in
					// onSuccess), so the nonce request does not use them.
					const fetchNonce = async () => {
						if (!options.useIssuedNonce) return undefined;
						const { data, error } = await $fetch<{ nonce: string }>(
							"/id-token/nonce",
							// `throw: false` keeps the `{ data, error }` shape when the app sets `throw: true`.
							{ method: "POST", body: { provider: "google" }, throw: false },
						);
						// Without a nonce the server rejects the sign-in, so do not show Google.
						if (!data?.nonce) {
							throw new Error("Google One Tap: failed to fetch a nonce", {
								cause: error,
							});
						}
						return data.nonce;
					};

					const autoSelect = opts?.autoSelect ?? options.autoSelect;
					const initialize = (
						nonce: string | undefined,
						onCredential: (response: { credential: string }) => Promise<void>,
					) =>
						window.google?.accounts.id.initialize({
							client_id: options.clientId,
							callback: onCredential,
							auto_select: autoSelect,
							cancel_on_tap_outside:
								opts?.cancelOnTapOutside ?? options.cancelOnTapOutside,
							context: opts?.context ?? options.context ?? "signin",
							ux_mode: opts?.uxMode || "popup",
							/**
							 * @see {@link https://developers.google.com/identity/gsi/web/guides/overview}
							 */
							itp_support: true,
							// Spread: @types/google.accounts lacks button_auto_select.
							...(opts?.button?.fedCM && {
								use_fedcm_for_button: true,
								button_auto_select: autoSelect,
							}),
							...options.additionalOptions,
							// After the spread, so only an issued nonce reaches Google.
							nonce,
						});

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

						const buttonConfig = opts.button.config ?? { type: "icon" };
						const renderButton = async () => {
							clearTimeout(buttonRefreshTimers.get(container));
							const nonce = await fetchNonce();
							initialize(nonce, async (response) => {
								let navigated = false;
								try {
									navigated = await callback(response.credential, nonce);
								} catch (error) {
									console.error("Error during button callback:", error);
								}
								if (nonce && !navigated) await refreshButton();
							});
							// A rendered button signs in with the nonce it was initialized
							// with, and each nonce is single-use and expires. Re-render with
							// a fresh nonce after every attempt and before expiry.
							if (nonce) {
								container.replaceChildren();
								buttonRefreshTimers.set(
									container,
									setTimeout(refreshButton, BUTTON_NONCE_REFRESH_MS),
								);
							}
							window.google?.accounts.id.renderButton(container, buttonConfig);
						};
						const refreshButton = async () => {
							// Stop once the app has removed the button.
							if (!container.isConnected) return;
							try {
								await renderButton();
							} catch (error) {
								console.error(
									"Google One Tap: failed to refresh the button",
									error,
								);
								buttonRefreshTimers.set(
									container,
									setTimeout(refreshButton, BUTTON_NONCE_RETRY_MS),
								);
							}
						};

						await renderButton();
						return;
					}

					isRequestInProgress = true;

					try {
						const [, nonce] = await Promise.all([
							loadGoogleScript(),
							fetchNonce(),
						]);
						await new Promise<void>((resolve, reject) => {
							let isResolved = false;
							const baseDelay = options.promptOptions?.baseDelay ?? 1000;
							const maxAttempts = options.promptOptions?.maxAttempts ?? 5;

							initialize(nonce, async (response) => {
								isResolved = true;
								try {
									await callback(response.credential, nonce);
									resolve();
								} catch (error) {
									console.error("Error during One Tap callback:", error);
									reject(error);
								}
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
										// FedCM gives no skip reason, and Google's cooldown blocks a retry.
										opts?.onPromptNotification?.(notification);
										resolve();
									} else if (notification.isNotDisplayed?.()) {
										// Only browsers without FedCM send display moments.
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

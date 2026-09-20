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
	 * The UI mode to use for the Google One Tap flow.
	 *
	 * passive: shows the One Tap prompt, rendered by the browser in a corner of
	 * the page. It can be shown without a user gesture.
	 *
	 * active: shows the browser's centered account chooser, so it can be wired
	 * to your own sign-in button. It requires FedCM support and a user gesture,
	 * and falls back to the passive prompt when FedCM is unavailable.
	 *
	 * @see {@link https://developers.google.com/privacy-sandbox/cookies/fedcm}
	 * @default "passive"
	 */
	mode?: ("passive" | "active") | undefined;
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
	 *
	 * In `active` mode it receives the `DOMException` the browser rejected the
	 * account chooser with, e.g. `NotAllowedError` when the user closes it, or
	 * no argument when the browser resolves the chooser without a credential.
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

let isRequestInProgress = false;

const GOOGLE_FEDCM_CONFIG_URL = "https://accounts.google.com/gsi/fedcm.json";
const GOOGLE_FEDCM_FIELDS = ["name", "email", "picture"];
const GOOGLE_FEDCM_SCOPE = "email profile openid";
const GOOGLE_FEDCM_MISSING_NONCE = "not_provided";

interface FedCMCredential extends Credential {
	token?: string;
}

function isFedCMSupported() {
	return typeof window !== "undefined" && "IdentityCredential" in window;
}

function extractIdToken(token: string | undefined): string | undefined {
	if (!token) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(token) as { id_token?: unknown };
		if (typeof parsed?.id_token === "string") {
			return parsed.id_token;
		}
	} catch {
		return token;
	}
	return token;
}

async function requestActiveModeIdToken({
	clientId,
	context,
	nonce,
	autoSelect,
}: {
	clientId: string;
	context: "signin" | "signup" | "use";
	nonce: string | undefined;
	autoSelect: boolean | undefined;
}): Promise<string | undefined> {
	const request = {
		mediation: autoSelect ? "optional" : "required",
		identity: {
			context,
			mode: "active",
			providers: [
				{
					configURL: GOOGLE_FEDCM_CONFIG_URL,
					clientId,
					nonce,
					fields: GOOGLE_FEDCM_FIELDS,
					params: {
						response_type: "id_token",
						scope: GOOGLE_FEDCM_SCOPE,
						nonce: nonce ?? GOOGLE_FEDCM_MISSING_NONCE,
						ss_domain: window.location.origin,
					},
				},
			],
		},
	} as unknown as CredentialRequestOptions;

	const credential = (await navigator.credentials.get(
		request,
	)) as FedCMCredential | null;

	return extractIdToken(credential?.token);
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
							const res = await $fetch("/one-tap/callback", {
								method: "POST",
								body: { idToken, callbackURL: opts?.callbackURL },
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
							use_fedcm_for_prompt: useFedCM,
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
						const res = await $fetch("/one-tap/callback", {
							method: "POST",
							body: { idToken, callbackURL: opts?.callbackURL },
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
					const modeValue = opts?.mode ?? options.mode ?? "passive";

					if (modeValue === "active") {
						if (!isFedCMSupported()) {
							console.warn(
								"Google One Tap: active mode needs FedCM support, falling back to the passive prompt.",
							);
						} else {
							isRequestInProgress = true;
							try {
								let idToken: string | undefined;
								try {
									idToken = await requestActiveModeIdToken({
										clientId: options.clientId,
										context: contextValue,
										nonce: opts?.nonce,
										autoSelect: autoSelect ?? options.autoSelect,
									});
								} catch (error) {
									opts?.onPromptNotification?.(error);
									return;
								}
								if (idToken) {
									await callback(idToken);
								} else {
									opts?.onPromptNotification?.();
								}
							} finally {
								isRequestInProgress = false;
							}
							return;
						}
					}

					isRequestInProgress = true;

					try {
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
								nonce: opts?.nonce,
								/**
								 * @see {@link https://developers.google.com/identity/gsi/web/guides/overview}
								 */
								itp_support: true,
								use_fedcm_for_prompt: useFedCM,
								...options.additionalOptions,
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

import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	ClientStore,
} from "@better-auth/core";
import type { BetterFetch, BetterFetchPlugin } from "@better-fetch/fetch";
import { getBaseURL } from "../../utils/url";
import { PACKAGE_VERSION } from "../../version";
import type { oauthPopup } from ".";
import { OAUTH_POPUP_MESSAGE_TYPE, POPUP_TOKEN_STORAGE_KEY } from "./constants";
import { OAUTH_POPUP_ERROR_CODES } from "./error-codes";
import type { OAuthPopupError } from "./types";

/** Inputs for `authClient.signIn.popup`; mirror the redirect sign-in. */
export interface SignInPopupOptions {
	/** Built-in social provider id (e.g. `"google"`). */
	provider?: string;
	/** Generic OAuth provider id (registered via `genericOAuth`). */
	providerId?: string;
	callbackURL?: string;
	errorCallbackURL?: string;
	newUserCallbackURL?: string;
	requestSignUp?: boolean;
	scopes?: string[];
	additionalData?: Record<string, unknown>;
	/** `window.open` feature string; defaults to a centered 500x600 window. */
	windowFeatures?: string;
	/** How long (ms) to wait for the popup to complete. Default 5 minutes. */
	timeoutMs?: number;
}

export interface SignInPopupResult {
	data: {
		success: boolean;
	} | null;
	error: {
		code: string;
		message: string;
		status?: number;
	} | null;
}

const POPUP_NAME = "better-auth-oauth";
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;
const CLOSED_POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** True when embedded cross-origin, where the cookie may be partitioned. */
function isEmbedded(): boolean {
	if (typeof window === "undefined" || window.self === window.top) {
		return false;
	}
	try {
		// A cross-origin parent throws on location access, a same-origin one does not.
		void window.top?.location.href;
		return false;
	} catch {
		return true;
	}
}

/** Reads the stored popup token (browser-only; null otherwise). */
export function getStoredPopupToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(POPUP_TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
}

function storePopupToken(token: string): void {
	try {
		window.localStorage?.setItem(POPUP_TOKEN_STORAGE_KEY, token);
	} catch {}
}

function clearPopupToken(): void {
	try {
		window.localStorage?.removeItem(POPUP_TOKEN_STORAGE_KEY);
	} catch {}
}

/**
 * Attaches the popup token as a bearer header when embedded (where the cookie is
 * partitioned), and clears it once the session ends so it can't be reused.
 */
export const popupBearerFetchPlugin: BetterFetchPlugin = {
	id: "better-auth-popup-bearer",
	name: "Popup Bearer",
	hooks: {
		onRequest(context) {
			if (!isEmbedded()) {
				return context;
			}
			const token = getStoredPopupToken();
			if (!token) return context;
			const headers = new Headers(context.headers);
			if (!headers.has("authorization")) {
				headers.set("authorization", `Bearer ${token}`);
			}
			return { ...context, headers };
		},
		onSuccess(context) {
			// Clear the stored token once the session ends
			const path = new URL(context.request.url).pathname;
			if (
				path.endsWith("/sign-out") ||
				path.endsWith("/revoke-session") ||
				path.endsWith("/revoke-sessions") ||
				path.endsWith("/revoke-other-sessions") ||
				path.endsWith("/delete-user")
			) {
				clearPopupToken();
			}
		},
	},
};

// One popup per page at a time (module-global).
let activePopup: Window | null = null;

function popupError(
	code: keyof typeof OAUTH_POPUP_ERROR_CODES,
	status?: number,
): SignInPopupResult {
	return {
		data: null,
		error: {
			code,
			message: String(OAUTH_POPUP_ERROR_CODES[code]),
			...(status ? { status } : {}),
		},
	};
}

function centeredFeatures(): string {
	const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
	const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
	return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},menubar=no,toolbar=no`;
}

function randomNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type PopupOutcome =
	| { status: "success"; token: string }
	| { status: "error"; error: OAuthPopupError }
	| { status: "cancelled" }
	| { status: "timeout" };

/**
 * Resolves with the token (or relayed error) once the completion page posts
 * back, gating on origin, type, and nonce.
 */
function waitForPopupResult(
	popup: Window,
	expectedOrigin: string,
	nonce: string,
	timeoutMs: number,
): Promise<PopupOutcome> {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (outcome: PopupOutcome) => {
			if (settled) return;
			settled = true;
			window.removeEventListener("message", onMessage);
			clearInterval(closedPoll);
			clearTimeout(timeout);
			try {
				if (!popup.closed) popup.close();
			} catch {}
			resolve(outcome);
		};
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== expectedOrigin) return;
			const data = event.data;
			if (data?.type !== OAUTH_POPUP_MESSAGE_TYPE) return;
			if (data.nonce !== nonce) return;
			if (data.error) {
				settle({ status: "error", error: data.error });
				return;
			}
			if (typeof data.token !== "string" || !data.token) return;
			settle({ status: "success", token: data.token });
		};
		const closedPoll = setInterval(() => {
			if (popup.closed) settle({ status: "cancelled" });
		}, CLOSED_POLL_MS);
		const timeout = setTimeout(() => settle({ status: "timeout" }), timeoutMs);
		window.addEventListener("message", onMessage);
	});
}

interface SignInPopupDeps {
	$fetch: BetterFetch;
	options?: BetterAuthClientOptions | undefined;
	/** Refreshes the reactive session, as the redirect flow's atom listeners do. */
	notifySessionSignal: () => void;
}

function resolveAuthURL(options?: BetterAuthClientOptions): URL {
	// Same resolution as the client (baseURL + basePath, default `/api/auth`).
	const configured =
		getBaseURL(options?.baseURL, options?.basePath) ??
		options?.basePath ??
		"/api/auth";
	return new URL(configured, window.location.origin);
}

/**
 * Builds `signIn.popup`. Runs the sign-in in the popup's own first-party
 * context (so the OAuth state cookie lands there), waits for the completion
 * page to post the session token back, stores it for the bearer fetch plugin,
 * and refreshes the reactive session.
 */
export function createSignInPopup({
	$fetch,
	options,
	notifySessionSignal,
}: SignInPopupDeps) {
	return async function signInPopup(
		opts: SignInPopupOptions,
	): Promise<SignInPopupResult> {
		if (typeof window === "undefined") {
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		const {
			provider,
			providerId,
			additionalData,
			windowFeatures,
			timeoutMs = DEFAULT_TIMEOUT_MS,
			callbackURL,
			errorCallbackURL,
			newUserCallbackURL,
			scopes,
			requestSignUp,
		} = opts;

		if (!provider && !providerId) {
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		if (activePopup && !activePopup.closed) {
			activePopup.focus();
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		const nonce = randomNonce();
		const authUrl = resolveAuthURL(options);
		const authOrigin = authUrl.origin;

		// Navigate the popup straight to the server start endpoint on the auth
		// origin, so it is first-party there and the state/marker cookies land in
		// the right partition even when the app is on a different origin.
		const startUrl = new URL(
			`${authUrl.href.replace(/\/$/, "")}/oauth-popup/start`,
		);
		startUrl.searchParams.set("provider", (provider ?? providerId) as string);
		startUrl.searchParams.set("popupOrigin", window.location.origin);
		startUrl.searchParams.set("popupNonce", nonce);
		if (callbackURL) startUrl.searchParams.set("callbackURL", callbackURL);
		if (errorCallbackURL)
			startUrl.searchParams.set("errorCallbackURL", errorCallbackURL);
		if (newUserCallbackURL)
			startUrl.searchParams.set("newUserCallbackURL", newUserCallbackURL);
		if (scopes?.length) startUrl.searchParams.set("scopes", scopes.join(","));
		if (requestSignUp) startUrl.searchParams.set("requestSignUp", "true");
		if (additionalData)
			startUrl.searchParams.set(
				"additionalData",
				JSON.stringify(additionalData),
			);

		// Open synchronously in the user gesture so the browser doesn't block it.
		const popup = window.open(
			startUrl.toString(),
			POPUP_NAME,
			windowFeatures ?? centeredFeatures(),
		);
		if (!popup) {
			return popupError("POPUP_BLOCKED");
		}
		activePopup = popup;

		const outcome = await waitForPopupResult(
			popup,
			authOrigin,
			nonce,
			timeoutMs,
		);
		activePopup = null;
		if (outcome.status === "timeout") return popupError("POPUP_TIMEOUT");
		if (outcome.status === "cancelled") return popupError("POPUP_CLOSED");
		if (outcome.status === "error") {
			return {
				data: null,
				error: {
					code: outcome.error.code,
					message: outcome.error.description || outcome.error.code,
				},
			};
		}

		// Persist the token only when embedded (the bearer plugin reads it there).
		// At top level the cookie authenticates, so clear any stale token instead
		// of leaving one an embedded context could later reuse.
		if (isEmbedded()) {
			storePopupToken(outcome.token);
		} else {
			clearPopupToken();
		}

		// Confirm the handoff resolves a session: the bearer plugin attaches the
		// token when embedded, the cookie resolves it at top level. A failure here
		// usually means the server `bearer` plugin is missing.
		const session = await $fetch("/get-session");
		if (session.error || !session.data) {
			return popupError("POPUP_SIGN_IN_FAILED", session.error?.status);
		}

		notifySessionSignal();

		return {
			data: { success: true },
			error: null,
		};
	};
}

/**
 * Client plugin for popup OAuth sign-in. Adds `authClient.signIn.popup`. Pair
 * with the server `oauthPopup` and `bearer` plugins.
 */
export const oauthPopupClient = () => {
	return {
		id: "oauth-popup",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof oauthPopup>,
		$ERROR_CODES: OAUTH_POPUP_ERROR_CODES,
		fetchPlugins: [popupBearerFetchPlugin],
		getActions: (
			$fetch: BetterFetch,
			$store: ClientStore,
			options: BetterAuthClientOptions | undefined,
		) => ({
			signIn: {
				popup: createSignInPopup({
					$fetch,
					options,
					notifySessionSignal: () => $store.notify("$sessionSignal"),
				}),
			},
		}),
	} satisfies BetterAuthClientPlugin;
};

export { POPUP_TOKEN_STORAGE_KEY } from "./constants";
export { OAUTH_POPUP_ERROR_CODES } from "./error-codes";

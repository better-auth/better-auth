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

/** Inputs for `authClient.signIn.popup`; mirror the redirect sign-in. */
export interface SignInPopupOptions {
	/** Built-in social provider id (uses `/sign-in/social`). */
	provider?: string;
	/** Generic OAuth provider id (uses `/sign-in/oauth2`). */
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
 * Attaches the popup token as a bearer header, but only inside a cross-site
 * iframe where the session cookie is partitioned away. At top level the cookie
 * works, so nothing is attached and a stale token can't shadow it.
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
	},
};

// One popup per client at a time.
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

type PopupOutcome = { token: string } | { reason: "cancelled" | "timeout" };

/**
 * Resolves with the token once the completion page posts it back,
 * gating on origin, type, and nonce.
 */
function waitForPopupToken(
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
			if (typeof data.token !== "string" || !data.token) return;
			settle({ token: data.token });
		};
		const closedPoll = setInterval(() => {
			if (popup.closed) settle({ reason: "cancelled" });
		}, CLOSED_POLL_MS);
		const timeout = setTimeout(() => settle({ reason: "timeout" }), timeoutMs);
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
			...signInBody
		} = opts;

		if (!provider && !providerId) {
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		if (activePopup && !activePopup.closed) {
			activePopup.focus();
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		// Open synchronously in the user gesture so the browser doesn't block it.
		const popup = window.open(
			"about:blank",
			POPUP_NAME,
			windowFeatures ?? centeredFeatures(),
		);
		if (!popup) {
			return popupError("POPUP_BLOCKED");
		}
		activePopup = popup;

		const nonce = randomNonce();
		const authUrl = resolveAuthURL(options);
		const authOrigin = authUrl.origin;
		const signInPath = providerId ? "sign-in/oauth2" : "sign-in/social";
		const signInUrl = `${authUrl.href.replace(/\/$/, "")}/${signInPath}`;

		// `popup.fetch` so the state cookie lands in the popup's partition.
		let authorizationUrl: string | undefined;
		try {
			const response = await popup.fetch(signInUrl, {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					...signInBody,
					...(provider ? { provider } : { providerId }),
					disableRedirect: true,
					additionalData: {
						...additionalData,
						popupOrigin: window.location.origin,
						popupNonce: nonce,
					},
				}),
			});
			authorizationUrl = ((await response.json()) as { url?: string })?.url;
		} catch {
			authorizationUrl = undefined;
		}

		if (!authorizationUrl) {
			activePopup = null;
			try {
				popup.close();
			} catch {}
			return popupError("POPUP_SIGN_IN_FAILED");
		}

		popup.location.href = authorizationUrl;

		const outcome = await waitForPopupToken(
			popup,
			authOrigin,
			nonce,
			timeoutMs,
		);
		activePopup = null;
		if (!("token" in outcome)) {
			return outcome.reason === "timeout"
				? popupError("POPUP_TIMEOUT")
				: popupError("POPUP_CLOSED");
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

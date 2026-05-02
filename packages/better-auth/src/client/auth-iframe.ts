/**
 * Framework-agnostic utilities for the Auth iframe component.
 * Used by React, Vue, Svelte, and Solid Auth components.
 */

import type { ClientAtomListener } from "@better-auth/core";

/**
 * Re-export ClientAtomListener as AtomListener for convenience
 */
export type AtomListener = ClientAtomListener;

/**
 * shadcn CSS variables to extract from parent DOM
 */
const SHADCN_VARIABLES = [
	"--background",
	"--foreground",
	"--card",
	"--card-foreground",
	"--popover",
	"--popover-foreground",
	"--primary",
	"--primary-foreground",
	"--secondary",
	"--secondary-foreground",
	"--muted",
	"--muted-foreground",
	"--accent",
	"--accent-foreground",
	"--destructive",
	"--destructive-foreground",
	"--border",
	"--input",
	"--ring",
	"--radius",
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
];

/**
 * Retry timeouts for sending CSS to iframe (in ms)
 */
const CSS_RETRY_TIMEOUTS = [25, 50, 100, 300, 600, 1000];

/**
 * Extract shadcn theme CSS variables from the parent DOM
 */
export function extractShadcnTheme(): string {
	if (typeof document === "undefined") return "";

	const root = document.documentElement;
	const style = getComputedStyle(root);

	const cssLines = SHADCN_VARIABLES.map((variable) => {
		const value = style.getPropertyValue(variable).trim();
		if (value) {
			return `  ${variable}: ${value};`;
		}
		return null;
	}).filter(Boolean);

	if (cssLines.length === 0) return "";

	return `:root {\n${cssLines.join("\n")}\n}`;
}

/**
 * Send CSS theme to the iframe
 */
export function sendCSSToIframe(iframe: HTMLIFrameElement | null): void {
	if (!iframe?.contentWindow) return;

	const css = extractShadcnTheme();
	if (css) {
		iframe.contentWindow.postMessage(
			{ type: "better-auth:css", css },
			window.location.origin,
		);
	}
}

/**
 * Format page name from slug (e.g., "sign-in" -> "Sign In")
 */
export function formatPageName(page: string): string {
	return page
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Message handler callbacks
 */
export interface MessageHandlerCallbacks {
	onSuccess?: (data: { redirectTo?: string }) => void;
	onError?: (error: { code: string; message: string }) => void;
	onSignal?: (signal: string) => void;
	onRequestCSS?: () => void;
	onResize?: (height: number) => void;
	onThemeReady?: () => void;
	onRequestComplete?: (path: string) => void;
}

/**
 * Create a message event handler for iframe communication
 */
export function createMessageHandler(
	callbacks: MessageHandlerCallbacks,
): (event: MessageEvent) => void {
	return (event: MessageEvent) => {
		if (event.origin !== window.location.origin) {
			return;
		}

		const message = event.data;
		if (!message || typeof message !== "object" || !message.type) {
			return;
		}

		switch (message.type) {
			case "better-auth:success":
				callbacks.onSuccess?.(message.data || {});
				break;
			case "better-auth:error":
				callbacks.onError?.(
					message.error || { code: "UNKNOWN", message: "Unknown error" },
				);
				break;
			case "better-auth:signal":
				if (message.signal) {
					callbacks.onSignal?.(message.signal);
				}
				break;
			case "better-auth:loaded":
				break;
			case "better-auth:request-css":
				callbacks.onRequestCSS?.();
				break;
			case "better-auth:resize":
				if (typeof message.height === "number") {
					callbacks.onResize?.(message.height);
				}
				break;
			case "better-auth:theme-ready":
				callbacks.onThemeReady?.();
				break;
			case "better-auth:request-complete":
				if (message.path) {
					callbacks.onRequestComplete?.(message.path);
				}
				break;
		}
	};
}

/**
 * Setup options for the auth iframe
 */
export interface SetupAuthIframeOptions {
	getIframe: () => HTMLIFrameElement | null;
	onSuccess?: (data: { redirectTo?: string }) => void;
	onError?: (error: { code: string; message: string }) => void;
	onResize?: (height: number) => void;
	onThemeReady?: () => void;
	/** Client store for triggering signals */
	$store?: { notify: (signal: string) => void };
	/** Atom listeners from client plugins to check on request completion */
	atomListeners?: AtomListener[];
}

/**
 * Setup result with cleanup function
 */
export interface SetupAuthIframeResult {
	/** Remove event listeners and clear timeouts */
	cleanup: () => void;
	/** Handle iframe load event - sends CSS with retries */
	handleIframeLoad: () => number[];
	/** Manually send CSS to iframe */
	sendCSS: () => void;
}

/**
 * Setup the auth iframe with message handling and CSS injection.
 * Returns a cleanup function to remove event listeners.
 */
export function setupAuthIframe(
	options: SetupAuthIframeOptions,
): SetupAuthIframeResult {
	const {
		getIframe,
		onSuccess,
		onError,
		onResize,
		onThemeReady,
		$store,
		atomListeners,
	} = options;

	const sendCSS = () => sendCSSToIframe(getIframe());

	/**
	 * Handle request completion by checking atomListeners for matching paths.
	 * This triggers signals for client plugins (e.g., session refresh after sign-in).
	 */
	const handleRequestComplete = (path: string) => {
		if (!atomListeners || !$store) return;

		// Remove baseURL prefix if present to get the relative path
		const relativePath = path.replace(/^\/api\/auth/, "");

		for (const listener of atomListeners) {
			if (listener.matcher(relativePath)) {
				// Trigger the signal
				$store.notify(listener.signal as string);
				// Call optional callback
				listener.callback?.(relativePath);
			}
		}
	};

	const messageHandler = createMessageHandler({
		onSuccess,
		onError,
		onSignal: (signal) => $store?.notify(signal),
		onRequestCSS: sendCSS,
		onResize,
		onThemeReady,
		onRequestComplete: handleRequestComplete,
	});

	window.addEventListener("message", messageHandler);

	const handleIframeLoad = (): number[] => {
		sendCSS();

		// Retry sending CSS in case iframe's listener wasn't ready
		const timeoutIds = CSS_RETRY_TIMEOUTS.map((delay) =>
			window.setTimeout(() => {
				sendCSS();
			}, delay),
		);

		return timeoutIds;
	};

	const cleanup = () => {
		window.removeEventListener("message", messageHandler);
	};

	return {
		cleanup,
		handleIframeLoad,
		sendCSS,
	};
}

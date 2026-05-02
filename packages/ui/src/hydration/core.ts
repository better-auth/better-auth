/**
 * Core utilities for hydration scripts.
 * These are vanilla JS/TS functions that manipulate DOM elements by ID.
 */

import { providerIcons } from "../templates/components/provider-icons";
import type { BetterAuthUIConfig } from "../types/config";

/**
 * Get an element by ID with type safety
 */
export function getEl<T extends HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

/**
 * Show an element by removing the 'hidden' class
 */
export function show(el: HTMLElement | null): void {
	el?.classList.remove("hidden");
}

/**
 * Hide an element by adding the 'hidden' class
 */
export function hide(el: HTMLElement | null): void {
	el?.classList.add("hidden");
}

/**
 * Toggle visibility of an element
 */
export function toggle(el: HTMLElement | null, visible: boolean): void {
	if (visible) {
		show(el);
	} else {
		hide(el);
	}
}

/**
 * Set loading state on a button
 */
export function setLoading(
	btn: HTMLButtonElement | null,
	loading: boolean,
	loadingText?: string,
	normalText?: string,
): void {
	if (!btn) return;
	btn.disabled = loading;
	if (loadingText && normalText) {
		btn.textContent = loading ? loadingText : normalText;
	}
}

/**
 * Disable all form inputs and buttons
 */
export function disableForm(form: HTMLFormElement | null): void {
	if (!form) return;
	const elements = form.querySelectorAll("input, button, select, textarea");
	elements.forEach((el) => {
		(el as HTMLInputElement).disabled = true;
	});
}

/**
 * Enable all form inputs and buttons
 */
export function enableForm(form: HTMLFormElement | null): void {
	if (!form) return;
	const elements = form.querySelectorAll("input, button, select, textarea");
	elements.forEach((el) => {
		(el as HTMLInputElement).disabled = false;
	});
}

/**
 * Show an error message in an error container
 */
export function showError(
	container: HTMLElement | null,
	msgEl: HTMLElement | null,
	message: string,
): void {
	if (!container || !msgEl) return;
	msgEl.textContent = message;
	show(container);
}

/**
 * Hide an error container
 */
export function hideError(container: HTMLElement | null): void {
	hide(container);
}

/**
 * Show a success message in a success container
 */
export function showSuccess(
	container: HTMLElement | null,
	msgEl: HTMLElement | null,
	message: string,
): void {
	if (!container || !msgEl) return;
	msgEl.textContent = message;
	show(container);
}

/**
 * Hide a success container
 */
export function hideSuccess(container: HTMLElement | null): void {
	hide(container);
}

/**
 * Inject logo and app name into a logo container
 */
export function injectLogo(
	containerId: string,
	config: BetterAuthUIConfig,
): void {
	const container = getEl(containerId);
	if (!container) return;

	let html = "";
	if (config.logo) {
		html += `<img src="${escapeHtml(config.logo)}" class="h-8 w-8" alt="${escapeHtml(config.appName)}" />`;
	}
	html += `<span class="text-xl font-semibold">${escapeHtml(config.appName)}</span>`;
	container.innerHTML = html;
}

/**
 * Inject social provider buttons into a container
 */
export function injectSocialButtons(
	containerId: string,
	config: BetterAuthUIConfig,
): void {
	const container = getEl(containerId);
	if (!container) return;

	if (!config.socialProviders || config.socialProviders.length === 0) {
		hide(container);
		return;
	}

	const buttonClass =
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full no-underline cursor-pointer";

	const buttons = config.socialProviders
		.map((provider) => {
			const icon = provider.icon || providerIcons[provider.id] || "";
			const href = `${config.apiBaseUrl}/sign-in/social?provider=${encodeURIComponent(provider.id)}`;
			return `<a href="${escapeHtml(href)}" class="${buttonClass}" data-provider="${escapeHtml(provider.id)}">
				<span class="size-4 shrink-0 [&>svg]:size-full">${icon}</span>
				<span>${escapeHtml(provider.name)}</span>
			</a>`;
		})
		.join("");

	container.innerHTML = buttons;
	show(container);
}

/**
 * Set the href of a link element
 */
export function setHref(id: string, href: string): void {
	const el = getEl<HTMLAnchorElement>(id);
	if (el) {
		el.href = href;
	}
}

/**
 * Set text content of an element
 */
export function setText(id: string, text: string): void {
	const el = getEl(id);
	if (el) {
		el.textContent = text;
	}
}

/**
 * Set innerHTML of an element (use with caution)
 */
export function setHtml(id: string, html: string): void {
	const el = getEl(id);
	if (el) {
		el.innerHTML = html;
	}
}

/**
 * Set value of an input element
 */
export function setValue(id: string, value: string): void {
	const el = getEl<HTMLInputElement>(id);
	if (el) {
		el.value = value;
	}
}

/**
 * Get value of an input element
 */
export function getValue(id: string): string {
	const el = getEl<HTMLInputElement>(id);
	return el?.value ?? "";
}

/**
 * Check if a checkbox is checked
 */
export function isChecked(id: string): boolean {
	const el = getEl<HTMLInputElement>(id);
	return el?.checked ?? false;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

/**
 * Parse URL query parameters
 */
export function getQueryParam(name: string): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get(name);
}

/**
 * Navigate to a URL
 */
export function navigate(url: string): void {
	window.location.href = url;
}

/**
 * Callbacks for hydration handlers
 */
export interface HydrationCallbacks {
	onSuccess?: (data: { redirectTo?: string }) => void;
	onError?: (error: { code: string; message: string }) => void;
}

/**
 * Post a message to notify listeners of auth events.
 * Works both in iframe mode (posts to parent) and direct embed mode (posts to self).
 */
function postAuthMessage(message: Record<string, unknown>): void {
	try {
		// Post to parent if in iframe, otherwise post to self
		const target = window.parent !== window ? window.parent : window;
		target.postMessage(message, window.location.origin);
	} catch {
		// Ignore errors
	}
}

/**
 * Notify of success
 */
export function notifyParentSuccess(data: { redirectTo?: string }): void {
	postAuthMessage({ type: "better-auth:success", data });
}

/**
 * Notify of error
 */
export function notifyParentError(error: {
	code: string;
	message: string;
}): void {
	postAuthMessage({ type: "better-auth:error", error });
}

/**
 * Notify of signal (e.g., session update)
 */
export function notifyParentSignal(signal: string): void {
	postAuthMessage({ type: "better-auth:signal", signal });
}

/**
 * Handle successful auth action
 */
export function handleSuccess(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks,
	redirectTo?: string,
): void {
	const targetUrl = redirectTo ?? config.redirectTo;

	// Notify parent if in embed mode
	notifyParentSuccess({ redirectTo: targetUrl });
	notifyParentSignal("$sessionSignal");

	// Call callback
	callbacks.onSuccess?.({ redirectTo: targetUrl });

	// Redirect if not in embed mode
	if (!config.embed) {
		navigate(targetUrl);
	}
}

/**
 * Handle auth error
 */
export function handleError(
	code: string,
	message: string,
	callbacks: HydrationCallbacks,
): void {
	notifyParentError({ code, message });
	callbacks.onError?.({ code, message });
}

/**
 * BROWSER RUNTIME - BUNDLED SEPARATELY.
 *
 * Files in `src/ui/runtime/` are compiled to a standalone browser IIFE by
 * `tsdown.runtime.config.ts` and embedded as a string in
 * `../runtime.generated.ts` (served at `/_ba/runtime.js`). This code runs ONLY
 * in the browser, do not import server/Node-only modules here.
 *
 * Captcha helper: reads the widget config emitted by the auth-ui pages,
 * renders the provider widget when supported (currently cloudflare-turnstile),
 * and injects the captcha token header on outgoing form submissions.
 */

type TurnstileParams = {
	sitekey: string;
	callback?: (token: string) => void;
	"error-callback"?: () => void;
	"expired-callback"?: () => void;
	"timeout-callback"?: () => void;
};

type TurnstileGlobal = {
	render: (target: Element, params: TurnstileParams) => string;
	reset?: (widgetId?: string) => void;
	getResponse?: (widgetId?: string) => string | undefined;
};

declare global {
	interface Window {
		turnstile?: TurnstileGlobal;
	}
}

export type CaptchaState = {
	provider: string;
	siteKey: string;
	headerName: string;
	endpoints: string[];
	token: string | null;
	widgetId: string | null;
	widget: HTMLElement | null;
};

const captchaState: CaptchaState = {
	provider: "",
	siteKey: "",
	headerName: "x-captcha-response",
	endpoints: [],
	token: null,
	widgetId: null,
	widget: null,
};

function parseEndpoints(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((value): value is string => typeof value === "string");
	} catch {
		return [];
	}
}

function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			`script[src='${src.replace(/'/g, "\\'")}']`,
		);
		if (existing) {
			if (existing.dataset.baLoaded === "true") {
				resolve();
				return;
			}
			existing.addEventListener("load", () => resolve(), { once: true });
			existing.addEventListener("error", () => reject(new Error("load")), {
				once: true,
			});
			return;
		}
		const script = document.createElement("script");
		script.src = src;
		script.async = true;
		script.defer = true;
		script.addEventListener(
			"load",
			() => {
				script.dataset.baLoaded = "true";
				resolve();
			},
			{ once: true },
		);
		script.addEventListener(
			"error",
			() => reject(new Error(`Failed to load ${src}`)),
			{ once: true },
		);
		document.head.appendChild(script);
	});
}

async function renderTurnstile(widget: HTMLElement): Promise<void> {
	if (!captchaState.siteKey) return;
	try {
		await loadScript("https://challenges.cloudflare.com/turnstile/v0/api.js");
	} catch {
		return;
	}
	const turnstile = window.turnstile;
	if (!turnstile) return;
	try {
		captchaState.widgetId = turnstile.render(widget, {
			sitekey: captchaState.siteKey,
			callback: (token) => {
				captchaState.token = token;
			},
			"error-callback": () => {
				captchaState.token = null;
			},
			"expired-callback": () => {
				captchaState.token = null;
				if (captchaState.widgetId && window.turnstile?.reset) {
					window.turnstile.reset(captchaState.widgetId);
				}
			},
			"timeout-callback": () => {
				captchaState.token = null;
			},
		});
	} catch {}
}

/**
 * Discover the first captcha widget on the page and hydrate config from its
 * data attributes. If the provider is Turnstile and a site key is set, the
 * widget is rendered inline so a token becomes available for form submits.
 */
export function initCaptcha(): void {
	const widget =
		document.querySelector<HTMLElement>("[data-ba-captcha-widget]") ?? null;
	if (!widget) return;
	captchaState.widget = widget;
	captchaState.provider = widget.getAttribute("data-ba-captcha-provider") || "";
	captchaState.siteKey = widget.getAttribute("data-ba-captcha-sitekey") || "";
	captchaState.headerName =
		widget.getAttribute("data-ba-captcha-header") || "x-captcha-response";
	captchaState.endpoints = parseEndpoints(
		widget.getAttribute("data-ba-captcha-endpoints"),
	);

	if (
		captchaState.provider === "cloudflare-turnstile" &&
		captchaState.siteKey
	) {
		void renderTurnstile(widget);
	}
}

/**
 * True when the plugin is enabled and the given form's action path is one
 * of the captcha-guarded endpoints, so the runtime should attach the token
 * header on submit.
 */
export function shouldAttachCaptcha(actionPath: string): boolean {
	if (!captchaState.provider) return false;
	if (captchaState.endpoints.length === 0) return false;
	try {
		const url = new URL(actionPath, window.location.href);
		return captchaState.endpoints.includes(url.pathname);
	} catch {
		return captchaState.endpoints.includes(actionPath);
	}
}

export function getCaptchaHeader(): { name: string; value: string } | null {
	if (!captchaState.token) return null;
	return { name: captchaState.headerName, value: captchaState.token };
}

export function resetCaptcha(): void {
	captchaState.token = null;
	if (
		captchaState.provider === "cloudflare-turnstile" &&
		captchaState.widgetId &&
		window.turnstile?.reset
	) {
		window.turnstile.reset(captchaState.widgetId);
	}
}

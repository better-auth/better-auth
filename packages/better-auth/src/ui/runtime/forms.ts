/**
 * BROWSER RUNTIME - BUNDLED SEPARATELY.
 *
 * Files in `src/ui/runtime/` are compiled to a standalone browser IIFE by
 * `tsdown.runtime.config.ts` and embedded as a string in
 * `../runtime.generated.ts` (served at `/_ba/runtime.js`). This code runs ONLY
 * in the browser, do not import server/Node-only modules here.
 *
 * After editing, regenerate the bundle:
 *   pnpm --filter better-auth build:ui-runtime
 */

export interface UIEffect {
	type: string;
	level?: string;
	message?: string;
	fallback?: string;
	url?: string;
	to?: string;
	target?: string;
	key?: string;
	value?: unknown;
	html?: string;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const state = new Map<string, unknown>();
let toastRegion: HTMLElement | undefined;

export function ensureToastRegion(): HTMLElement {
	if (toastRegion) return toastRegion;
	toastRegion = document.createElement("div");
	toastRegion.className = "ba-toast-region";
	toastRegion.setAttribute("aria-live", "polite");
	toastRegion.setAttribute("aria-atomic", "true");
	// Use the popover API so the region lives in the top layer, above the
	// modal overlay and its blurred backdrop. Without this, a toast can render
	// behind an open dialog.
	if (typeof toastRegion.showPopover === "function") {
		toastRegion.setAttribute("popover", "manual");
	}
	document.body.appendChild(toastRegion);
	return toastRegion;
}

export function promoteToastRegion(region: HTMLElement): void {
	if (typeof region.showPopover !== "function") return;
	// Re-assert the region's position at the top of the top layer so it stays
	// above any dialog that may have opened after the region was first shown.
	try {
		if (region.matches(":popover-open")) region.hidePopover();
		region.showPopover();
	} catch {}
}

export function showToast(
	type: string | undefined,
	message: string | undefined,
): void {
	if (!message) return;
	const region = ensureToastRegion();
	promoteToastRegion(region);
	const toast = document.createElement("div");
	toast.className = "ba-toast";
	toast.dataset.type = type || "info";
	toast.setAttribute("role", type === "error" ? "alert" : "status");

	const icon = document.createElement("span");
	icon.className = "ba-toast-icon";
	icon.setAttribute("aria-hidden", "true");

	const body = document.createElement("div");
	body.className = "ba-toast-message";
	body.textContent = message;

	toast.appendChild(icon);
	toast.appendChild(body);
	region.appendChild(toast);

	requestAnimationFrame(() => {
		toast.dataset.visible = "true";
	});

	let removed = false;
	const dismiss = () => {
		if (removed) return;
		removed = true;
		toast.dataset.visible = "false";
		window.setTimeout(() => toast.remove(), 220);
	};
	toast.addEventListener("click", dismiss);
	window.setTimeout(dismiss, 5000);
}

export function getBase(name: string): string {
	return document.documentElement.getAttribute(name) || "";
}

export function joinPath(base: string, path: string): string {
	if (!base) return path;
	if (/^https?:\/\//.test(path)) return path;
	return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

function restoreDescribedBy(input: Element): void {
	const original = input.getAttribute("data-ba-describedby-original");
	if (original === null) {
		input.removeAttribute("aria-describedby");
		return;
	}
	if (original) input.setAttribute("aria-describedby", original);
	else input.removeAttribute("aria-describedby");
}

export function clearFieldError(input: Element): void {
	const id = input.getAttribute("data-ba-field-error-id");
	if (id) {
		document.getElementById(id)?.remove();
	}
	input.removeAttribute("data-ba-field-error-id");
	input.removeAttribute("aria-invalid");
	restoreDescribedBy(input);
}

export function clearFieldErrors(form: HTMLFormElement): void {
	form.querySelectorAll(".ba-field-error").forEach((el) => el.remove());
	form.querySelectorAll("[data-ba-field-error-id]").forEach((input) => {
		input.removeAttribute("data-ba-field-error-id");
		input.removeAttribute("aria-invalid");
		restoreDescribedBy(input);
	});
}

export function clearLegacyFormStatus(form: HTMLFormElement): void {
	form
		.querySelectorAll(".ba-form-status,[data-ba-form-status]")
		.forEach((el) => {
			el.remove();
		});
}

function setFieldError(input: Element, message: string): void {
	clearFieldError(input);
	const fieldName = input.getAttribute("name") || input.id || "field";
	const id =
		"ba-field-error-" +
		fieldName.replace(/[^a-zA-Z0-9_-]/g, "-") +
		"-" +
		Math.random().toString(36).slice(2);
	const error = document.createElement("div");
	error.id = id;
	error.className = "ba-field-error";
	error.textContent = message;
	input.insertAdjacentElement("afterend", error);
	if (!input.hasAttribute("data-ba-describedby-original")) {
		input.setAttribute(
			"data-ba-describedby-original",
			input.getAttribute("aria-describedby") || "",
		);
	}
	const describedBy = [input.getAttribute("data-ba-describedby-original"), id]
		.filter(Boolean)
		.join(" ");
	input.setAttribute("aria-describedby", describedBy);
	input.setAttribute("aria-invalid", "true");
	input.setAttribute("data-ba-field-error-id", id);
}

export function isValidatableControl(
	el: EventTarget | null,
): el is FormControl {
	if (
		!(
			el instanceof HTMLInputElement ||
			el instanceof HTMLSelectElement ||
			el instanceof HTMLTextAreaElement
		)
	)
		return false;
	if (el.disabled) return false;
	if (
		el instanceof HTMLInputElement &&
		["button", "submit", "reset", "hidden"].includes(el.type)
	)
		return false;
	return typeof el.checkValidity === "function";
}

function getValidationMessage(control: FormControl): string {
	const validity = control.validity;
	if (validity.valueMissing) return "This field is required.";
	if (validity.tooShort && "minLength" in control && control.minLength > -1)
		return "Must be at least " + control.minLength + " characters.";
	if (validity.tooLong && "maxLength" in control && control.maxLength > -1)
		return "Must be at most " + control.maxLength + " characters.";
	if (validity.typeMismatch && control.type === "email")
		return "Enter a valid email address.";
	if (validity.rangeUnderflow) return "Value is too low.";
	if (validity.rangeOverflow) return "Value is too high.";
	if (validity.stepMismatch) return "Enter a valid value.";
	if (validity.patternMismatch) return "Enter a valid value.";
	return control.validationMessage || "Please check this field.";
}

export function validateForm(form: HTMLFormElement): boolean {
	clearFieldErrors(form);
	let firstInvalid: FormControl | null = null;
	for (const control of form.querySelectorAll("input,select,textarea")) {
		if (!isValidatableControl(control)) continue;
		if (control.checkValidity()) continue;
		if (!firstInvalid) firstInvalid = control;
		setFieldError(control, getValidationMessage(control));
	}
	if (firstInvalid) {
		firstInvalid.focus();
		return false;
	}
	return true;
}

function coerceFormValue(
	input: HTMLInputElement,
	value: string,
): string | number | boolean | undefined {
	if (input.type === "checkbox") return input.checked;
	if (input.type === "number") return value === "" ? undefined : Number(value);
	return value;
}

export function formToJSON(form: HTMLFormElement): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	const data = new FormData(form);
	for (const [key, value] of data.entries()) {
		const input = form.elements.namedItem(key);
		if (typeof value !== "string") continue;
		if (input instanceof RadioNodeList) {
			body[key] = value;
			continue;
		}
		body[key] =
			input instanceof HTMLInputElement ? coerceFormValue(input, value) : value;
	}
	for (const input of form.querySelectorAll<HTMLInputElement>(
		"input[type='checkbox'][name]",
	)) {
		if (!data.has(input.name)) body[input.name] = false;
	}
	return body;
}

export function getMessage(payload: unknown, fallback: string): string {
	if (!payload) return fallback;
	if (typeof payload === "string") return fallback;
	if (typeof payload !== "object") return fallback;
	const data = payload as Record<string, unknown>;
	if (typeof data.message === "string") return data.message;
	if (typeof data.error === "string") return data.error;
	if (data.error && typeof data.error === "object") {
		const nested = (data.error as Record<string, unknown>).message;
		if (typeof nested === "string") return nested;
	}
	if (typeof data.code === "string") return data.code;
	return fallback;
}

export async function readPayload(response: Response): Promise<unknown> {
	const contentType = response.headers.get("content-type") || "";
	const text = await response.text();
	if (!text) return null;
	if (!contentType.includes("json")) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

export function parseEffects(value: string | null): UIEffect[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		return [];
	}
}

function getEffectTarget(target: unknown): HTMLElement | null {
	if (typeof target !== "string" || !target) return null;
	return (
		document.getElementById(target) ||
		document.querySelector<HTMLElement>(
			"[data-ba-panel='" + CSS.escape(target) + "']",
		)
	);
}

export const openDialogs = new Set<HTMLElement>();

function lockBodyScroll(): void {
	if (openDialogs.size === 0) {
		document.documentElement.dataset.baScrollLock =
			document.body.style.overflow || "";
	}
}

function unlockBodyScroll(): void {
	if (openDialogs.size === 0) {
		document.body.style.overflow =
			document.documentElement.dataset.baScrollLock || "";
		delete document.documentElement.dataset.baScrollLock;
	}
}

export function openDialog(target: string): void {
	const dialog = getEffectTarget(target);
	if (!dialog) return;
	// Rendered as a plain z-index overlay rather than a native top-layer
	// dialog. Top-layer dialogs cover browser-extension overlays such as
	// 1Password's passkey account picker, so we avoid them here.
	// Move to <body> so position:fixed covers the viewport even when the
	// dialog was authored inside a transformed ancestor (e.g. .ba-auth-card).
	lockBodyScroll();
	if (dialog.parentElement !== document.body) {
		document.body.appendChild(dialog);
	}
	dialog.hidden = false;
	openDialogs.add(dialog);
	document.body.style.overflow = "hidden";
	const panel = dialog.querySelector(".ba-modal-panel") || dialog;
	if (panel instanceof HTMLElement && typeof panel.focus === "function") {
		if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
		panel.focus();
	}
}

export function closeDialog(target: string | null | undefined): void {
	const dialog = getEffectTarget(target);
	if (!dialog) return;
	dialog.hidden = true;
	openDialogs.delete(dialog);
	unlockBodyScroll();
}

export async function executeEffects(
	effects: UIEffect[],
	payload: unknown,
	fallbackType: string,
	fallbackMessage: string,
): Promise<void> {
	if (!effects.length) {
		showToast(fallbackType, getMessage(payload, fallbackMessage));
		return;
	}
	for (const effect of effects) {
		if (!effect || typeof effect !== "object") continue;
		if (effect.type === "toast") {
			showToast(
				effect.level || fallbackType || "info",
				effect.message || fallbackMessage,
			);
		}
		if (effect.type === "toastFromError") {
			showToast(
				"error",
				getMessage(payload, effect.fallback || fallbackMessage),
			);
		}
		if (effect.type === "redirect" || effect.type === "navigate") {
			window.location.href = effect.url || effect.to || "";
			return;
		}
		if (effect.type === "reload") {
			window.location.reload();
			return;
		}
		if (effect.type === "show") {
			const target = getEffectTarget(effect.target);
			if (target) target.hidden = false;
		}
		if (effect.type === "hide") {
			const target = getEffectTarget(effect.target);
			if (target) target.hidden = true;
		}
		if (effect.type === "openDialog") {
			if (effect.target) openDialog(effect.target);
		}
		if (effect.type === "closeDialog") {
			closeDialog(effect.target);
		}
		if (effect.type === "set" && typeof effect.key === "string") {
			updateBindings(effect.key, effect.value);
		}
		if (
			effect.type === "replace" &&
			typeof effect.target === "string" &&
			typeof effect.html === "string"
		) {
			const target = document.querySelector(effect.target);
			if (target) target.innerHTML = effect.html;
		}
	}
}

export function resolveActionURL(form: HTMLFormElement): string {
	const action = form.getAttribute("action") || window.location.href;
	const kind = form.getAttribute("data-ba-action-kind");
	if (kind === "auth-route") {
		return joinPath(getBase("data-ba-api-base"), action);
	}
	if (kind === "server-action") {
		return joinPath(getBase("data-ba-ui-base"), action);
	}
	return action;
}

export function appendFormQuery(url: string, form: HTMLFormElement): URL {
	const next = new URL(url, window.location.href);
	const body = formToJSON(form);
	for (const [key, value] of Object.entries(body)) {
		if (value !== undefined && value !== null)
			next.searchParams.set(key, String(value));
	}
	return next;
}

export function setBindingState(key: string, value: unknown): void {
	state.set(key, value);
}

export function updateBindings(key: string, value: unknown): void {
	state.set(key, value);
	document
		.querySelectorAll<HTMLElement>("[data-ba-bind='" + CSS.escape(key) + "']")
		.forEach((el) => {
			if (el instanceof HTMLInputElement && el.type === "checkbox")
				el.checked = Boolean(value);
			else if ("value" in el)
				(el as HTMLInputElement).value = value == null ? "" : String(value);
		});
	document.querySelectorAll<HTMLElement>("[data-ba-when]").forEach((el) => {
		try {
			const condition = JSON.parse(el.getAttribute("data-ba-when") || "false");
			if (typeof condition === "boolean") {
				el.hidden = !condition;
				return;
			}
			const current = state.get(condition.bind);
			el.hidden =
				condition.equals !== undefined
					? current !== condition.equals
					: current === condition.not;
		} catch {
			el.hidden = false;
		}
	});
}

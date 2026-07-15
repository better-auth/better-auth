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

import {
	clearFieldError,
	clearLegacyFormStatus,
	closeDialog,
	executeEffects,
	formToJSON,
	getMessage,
	isValidatableControl,
	openDialog,
	openDialogs,
	parseEffects,
	readPayload,
	resolveActionURL,
	setBindingState,
	showToast,
	updateBindings,
	validateForm,
} from "./forms";
import { handlePasskeyRegister, handlePasskeySubmit } from "./passkey";

function read(
	el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): string | boolean {
	if (el instanceof HTMLInputElement && el.type === "checkbox")
		return el.checked;
	return el.value;
}

document.querySelectorAll<HTMLElement>("[data-ba-bind]").forEach((el) => {
	const key = el.getAttribute("data-ba-bind");
	if (!key) return;
	if (
		!(
			el instanceof HTMLInputElement ||
			el instanceof HTMLSelectElement ||
			el instanceof HTMLTextAreaElement
		)
	)
		return;
	setBindingState(key, read(el));
	el.addEventListener("input", () => updateBindings(key, read(el)));
	el.addEventListener("change", () => updateBindings(key, read(el)));
});

document
	.querySelectorAll<HTMLFormElement>("form[data-ba-enhanced]")
	.forEach((form) => {
		form.noValidate = true;
		clearLegacyFormStatus(form);
	});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape" || openDialogs.size === 0) return;
	const dialogs = Array.from(openDialogs);
	const dialog = dialogs[dialogs.length - 1];
	if (dialog && dialog.id) {
		event.preventDefault();
		closeDialog(dialog.id);
	}
});

document.addEventListener("input", (event) => {
	const target = event.target;
	if (!isValidatableControl(target)) return;
	if (!target.closest("form[data-ba-enhanced]")) return;
	if (target.checkValidity()) clearFieldError(target);
});

document.addEventListener("change", (event) => {
	const target = event.target;
	if (!isValidatableControl(target)) return;
	if (!target.closest("form[data-ba-enhanced]")) return;
	if (target.checkValidity()) clearFieldError(target);
});

document.addEventListener("click", async (event) => {
	const passwordToggle =
		event.target instanceof Element
			? event.target.closest("[data-ba-toggle-password]")
			: null;
	if (passwordToggle) {
		event.preventDefault();
		const wrap = passwordToggle.closest(".ba-input-affix");
		const input = wrap?.querySelector("input");
		if (!(input instanceof HTMLInputElement)) return;
		const show = input.type === "password";
		input.type = show ? "text" : "password";
		passwordToggle.setAttribute(
			"aria-label",
			show ? "Hide password" : "Show password",
		);
		passwordToggle.setAttribute("data-visible", show ? "true" : "false");
		return;
	}
	const closeTarget =
		event.target instanceof Element
			? event.target.closest("[data-ba-dialog-close]")
			: null;
	if (closeTarget) {
		event.preventDefault();
		closeDialog(closeTarget.getAttribute("data-ba-dialog-close"));
		return;
	}
	const target =
		event.target instanceof Element
			? event.target.closest("[data-ba-on-click]")
			: null;
	if (!target) return;
	const action = JSON.parse(target.getAttribute("data-ba-on-click") || "{}");
	if (action.type === "navigate") {
		window.location.href = action.to;
	}
	if (action.type !== "server") return;
	event.preventDefault();
	const response = await fetch(
		window.location.pathname.replace(/\/$/, "") +
			"/_ba/action/" +
			encodeURIComponent(action.id),
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ params: action.params || {} }),
		},
	);
	const effects = await response.json().catch(() => []);
	await executeEffects(
		Array.isArray(effects) ? effects : [effects],
		null,
		"info",
		"Completed successfully.",
	);
});

document.addEventListener("submit", async (event) => {
	const form = event.target;
	if (!(form instanceof HTMLFormElement) || !form.matches("[data-ba-enhanced]"))
		return;
	event.preventDefault();
	form.noValidate = true;
	clearLegacyFormStatus(form);

	const submitter =
		event.submitter instanceof HTMLElement ? event.submitter : null;
	const method = (form.getAttribute("method") || "GET").toUpperCase();
	const action = resolveActionURL(form);
	const successMessage =
		form.getAttribute("data-ba-success") || "Completed successfully.";
	const errorMessage =
		form.getAttribute("data-ba-error") || "Something went wrong.";
	const successEffects = parseEffects(
		form.getAttribute("data-ba-success-effects"),
	);
	const errorEffects = parseEffects(form.getAttribute("data-ba-error-effects"));

	if (!validateForm(form)) {
		return;
	}

	if (form.matches("[data-ba-passkey-auth]")) {
		await handlePasskeySubmit(
			form,
			submitter,
			successEffects,
			errorEffects,
			errorMessage,
		);
		return;
	}

	if (form.matches("[data-ba-passkey-register]")) {
		await handlePasskeyRegister(
			form,
			submitter,
			successEffects,
			errorEffects,
			errorMessage,
		);
		return;
	}

	form.setAttribute("aria-busy", "true");
	if (submitter && "disabled" in submitter)
		(submitter as HTMLButtonElement).disabled = true;

	try {
		const url = new URL(action, window.location.href);
		const init: RequestInit & { headers: Record<string, string> } = {
			method,
			credentials: "include",
			headers: {
				accept: "application/json",
			},
		};

		if (method === "GET") {
			const body = formToJSON(form);
			for (const [key, value] of Object.entries(body)) {
				if (value !== undefined && value !== null)
					url.searchParams.set(key, String(value));
			}
		} else {
			init.headers["content-type"] = "application/json";
			init.body = JSON.stringify(formToJSON(form));
		}

		const response = await fetch(url, init);
		const payload = await readPayload(response);
		const data =
			payload && typeof payload === "object"
				? (payload as Record<string, unknown>)
				: null;

		if (!response.ok) {
			const message = getMessage(payload, errorMessage);
			await executeEffects(errorEffects, payload, "error", message);
			return;
		}

		if (data && data.redirect === true && typeof data.url === "string") {
			window.location.href = data.url;
			return;
		}

		if (data && data.twoFactorRedirect === true) {
			openDialog("two-factor-challenge");
			form.dispatchEvent(
				new CustomEvent("better-auth:two-factor-required", {
					bubbles: true,
					detail: payload,
				}),
			);
			return;
		}

		const message = getMessage(payload, successMessage);
		await executeEffects(successEffects, payload, "success", message);
		form.dispatchEvent(
			new CustomEvent("better-auth:form-success", {
				bubbles: true,
				detail: payload,
			}),
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : errorMessage;
		showToast("error", message);
	} finally {
		form.removeAttribute("aria-busy");
		if (submitter && "disabled" in submitter)
			(submitter as HTMLButtonElement).disabled = false;
	}
});

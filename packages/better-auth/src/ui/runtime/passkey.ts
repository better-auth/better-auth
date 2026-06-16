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

import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type { UIEffect } from "./forms";
import {
	appendFormQuery,
	executeEffects,
	getBase,
	getMessage,
	joinPath,
	readPayload,
	resolveActionURL,
} from "./forms";

function disableSubmitter(
	submitter: HTMLElement | null,
	disabled: boolean,
): void {
	if (submitter && "disabled" in submitter) {
		(submitter as HTMLButtonElement).disabled = disabled;
	}
}

/**
 * Passkey authentication ceremony: fetch options, run the WebAuthn assertion
 * via `@simplewebauthn/browser`, then post the response to the verify route.
 */
export async function handlePasskeySubmit(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
	successEffects: UIEffect[],
	errorEffects: UIEffect[],
	errorMessage: string,
): Promise<void> {
	if (!window.PublicKeyCredential || !navigator.credentials) {
		const message = "Passkeys are not supported in this browser.";
		await executeEffects(errorEffects, { message }, "error", message);
		return;
	}

	const verifyPath = form.getAttribute("data-ba-passkey-verify");
	if (!verifyPath) {
		const message = "Passkey verification route is not configured.";
		await executeEffects(errorEffects, { message }, "error", message);
		return;
	}

	form.setAttribute("aria-busy", "true");
	disableSubmitter(submitter, true);

	try {
		const generateURL = appendFormQuery(resolveActionURL(form), form);
		const optionsResponse = await fetch(generateURL, {
			method: "GET",
			credentials: "include",
			headers: { accept: "application/json" },
		});
		const options = await readPayload(optionsResponse);
		if (!optionsResponse.ok || !options) {
			const message = getMessage(options, errorMessage);
			await executeEffects(errorEffects, options, "error", message);
			return;
		}

		const assertion = await startAuthentication({
			optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
		});
		const { clientExtensionResults, ...response } = assertion;
		void clientExtensionResults;

		const verifyResponse = await fetch(
			joinPath(getBase("data-ba-api-base"), verifyPath),
			{
				method: "POST",
				credentials: "include",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: JSON.stringify({ response }),
			},
		);
		const payload = await readPayload(verifyResponse);
		if (!verifyResponse.ok) {
			const message = getMessage(payload, errorMessage);
			await executeEffects(errorEffects, payload, "error", message);
			return;
		}

		await executeEffects(
			successEffects,
			payload,
			"success",
			"Passkey verified.",
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : errorMessage;
		await executeEffects(errorEffects, { message }, "error", message);
	} finally {
		form.removeAttribute("aria-busy");
		disableSubmitter(submitter, false);
	}
}

/**
 * Passkey registration ceremony: fetch options, run the WebAuthn attestation
 * via `@simplewebauthn/browser`, then post the response to the verify route.
 */
export async function handlePasskeyRegister(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
	successEffects: UIEffect[],
	errorEffects: UIEffect[],
	errorMessage: string,
): Promise<void> {
	if (!window.PublicKeyCredential || !navigator.credentials) {
		const message = "Passkeys are not supported in this browser.";
		await executeEffects(errorEffects, { message }, "error", message);
		return;
	}

	const verifyPath = form.getAttribute("data-ba-passkey-verify");
	if (!verifyPath) {
		const message = "Passkey verification route is not configured.";
		await executeEffects(errorEffects, { message }, "error", message);
		return;
	}

	form.setAttribute("aria-busy", "true");
	disableSubmitter(submitter, true);

	try {
		const generateURL = appendFormQuery(resolveActionURL(form), form);
		const optionsResponse = await fetch(generateURL, {
			method: "GET",
			credentials: "include",
			headers: { accept: "application/json" },
		});
		const options = await readPayload(optionsResponse);
		if (!optionsResponse.ok || !options) {
			const message = getMessage(options, errorMessage);
			await executeEffects(errorEffects, options, "error", message);
			return;
		}

		const response = await startRegistration({
			optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
		});

		const verifyResponse = await fetch(
			joinPath(getBase("data-ba-api-base"), verifyPath),
			{
				method: "POST",
				credentials: "include",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: JSON.stringify({ response }),
			},
		);
		const payload = await readPayload(verifyResponse);
		if (!verifyResponse.ok) {
			const message = getMessage(payload, errorMessage);
			await executeEffects(errorEffects, payload, "error", message);
			return;
		}

		await executeEffects(
			successEffects,
			payload,
			"success",
			"Passkey registered.",
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : errorMessage;
		await executeEffects(errorEffects, { message }, "error", message);
	} finally {
		form.removeAttribute("aria-busy");
		disableSubmitter(submitter, false);
	}
}

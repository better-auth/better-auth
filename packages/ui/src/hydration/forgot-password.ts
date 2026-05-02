/**
 * Hydration handler for the forgot-password page.
 * Attaches event listeners and handles form submission.
 */

import type { BetterAuthUIConfig } from "../types/config";
import { authClient } from "./auth-client";
import type { HydrationCallbacks } from "./core";
import {
	getEl,
	getValue,
	handleError,
	hide,
	hideError,
	injectLogo,
	navigate,
	notifyParentSuccess,
	setHref,
	setLoading,
	show,
	showError,
} from "./core";

export function hydrateForgotPassword(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get elements
	const formView = getEl("ba-forgot-form-view");
	const successView = getEl("ba-forgot-success-view");
	const form = getEl<HTMLFormElement>("ba-forgot-form");
	const submitBtn = getEl<HTMLButtonElement>("ba-forgot-submit");
	const backBtn = getEl<HTMLButtonElement>("ba-forgot-back-btn");
	const errorContainer = getEl("ba-forgot-error");
	const errorMsg = getEl("ba-forgot-error-msg");

	// Inject dynamic content
	injectLogo("ba-forgot-logo", config);
	setHref("ba-forgot-signin-link", config.paths.signIn);

	// Hide footer in embed mode
	if (config.embed) {
		hide(getEl("ba-forgot-footer"));
	}

	// Form submission handler
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);
		setLoading(submitBtn, true, "Sending...", "Send Reset Link");

		const email = getValue("ba-forgot-email");

		const { error } = await authClient.forgetPassword({
			email,
			redirectTo: config.paths.resetPassword,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("FORGOT_PASSWORD_ERROR", error.statusText, callbacks);
			setLoading(submitBtn, false, "Sending...", "Send Reset Link");
			return;
		}

		// Show success view
		hide(formView);
		show(successView);
		notifyParentSuccess({});
		callbacks.onSuccess?.({});
	});

	// Back button handler
	backBtn?.addEventListener("click", () => {
		navigate(config.paths.signIn);
	});
}

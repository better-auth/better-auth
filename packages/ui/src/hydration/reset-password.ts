/**
 * Hydration handler for the reset-password page.
 * Attaches event listeners and handles form submission.
 */

import type { BetterAuthUIConfig } from "../types/config";
import { authClient } from "./auth-client";
import type { HydrationCallbacks } from "./core";
import {
	getEl,
	getQueryParam,
	getValue,
	handleError,
	hide,
	hideError,
	injectLogo,
	navigate,
	notifyParentSuccess,
	setLoading,
	show,
	showError,
} from "./core";

export function hydrateResetPassword(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get token from URL or args
	const urlToken = getQueryParam("token");
	const token = (config.args?.token as string) || urlToken;

	// Get elements
	const invalidView = getEl("ba-reset-invalid-view");
	const formView = getEl("ba-reset-form-view");
	const successView = getEl("ba-reset-success-view");
	const form = getEl<HTMLFormElement>("ba-reset-form");
	const submitBtn = getEl<HTMLButtonElement>("ba-reset-submit");
	const requestBtn = getEl<HTMLButtonElement>("ba-reset-request-btn");
	const signinBtn = getEl<HTMLButtonElement>("ba-reset-signin-btn");
	const errorContainer = getEl("ba-reset-error");
	const errorMsg = getEl("ba-reset-error-msg");

	// If no token, show invalid view
	if (!token) {
		hide(formView);
		hide(successView);
		show(invalidView);

		requestBtn?.addEventListener("click", () => {
			navigate(config.paths.forgotPassword);
		});
		return;
	}

	// Inject dynamic content
	injectLogo("ba-reset-logo", config);

	// Form submission handler
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);

		const password = getValue("ba-reset-password");
		const confirmPassword = getValue("ba-reset-confirm");

		// Validate passwords match
		if (password !== confirmPassword) {
			const message = "Passwords do not match";
			showError(errorContainer, errorMsg, message);
			handleError("VALIDATION_ERROR", message, callbacks);
			return;
		}

		// Validate password length
		if (password.length < config.minPasswordLength) {
			const message = `Password must be at least ${config.minPasswordLength} characters`;
			showError(errorContainer, errorMsg, message);
			handleError("VALIDATION_ERROR", message, callbacks);
			return;
		}

		setLoading(submitBtn, true, "Resetting...", "Reset Password");

		const { error } = await authClient.resetPassword({
			token,
			newPassword: password,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("RESET_PASSWORD_ERROR", error.statusText, callbacks);
			setLoading(submitBtn, false, "Resetting...", "Reset Password");
			return;
		}

		// Show success view
		hide(formView);
		show(successView);
		notifyParentSuccess({ redirectTo: config.paths.signIn });
		callbacks.onSuccess?.({ redirectTo: config.paths.signIn });
	});

	// Sign in button handler
	signinBtn?.addEventListener("click", () => {
		navigate(config.paths.signIn);
	});
}

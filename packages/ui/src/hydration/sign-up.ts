/**
 * Hydration handler for the sign-up page.
 * Attaches event listeners and handles form submission.
 */

import type { BetterAuthUIConfig } from "../types/config";
import { authClient } from "./auth-client";
import type { HydrationCallbacks } from "./core";
import {
	getEl,
	getValue,
	handleError,
	handleSuccess,
	hide,
	hideError,
	injectLogo,
	injectSocialButtons,
	setHref,
	setLoading,
	setText,
	showError,
} from "./core";

export function hydrateSignUp(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get elements
	const form = getEl<HTMLFormElement>("ba-signup-form");
	const submitBtn = getEl<HTMLButtonElement>("ba-signup-submit");
	const passkeyBtn = getEl<HTMLButtonElement>("ba-signup-passkey");
	const errorContainer = getEl("ba-signup-error");
	const errorMsg = getEl("ba-signup-error-msg");

	// Inject dynamic content
	injectLogo("ba-signup-logo", config);
	injectSocialButtons("ba-signup-social", config);
	setHref("ba-signup-signin-link", config.paths.signIn);
	setText("ba-signup-description", `Get started with ${config.appName}`);

	// Hide features based on config
	if (!config.features.emailPassword) {
		hide(form);
	}
	if (!config.features.passkey) {
		hide(getEl("ba-signup-passkey-wrapper"));
	}

	// Hide divider if no social or no email/password
	const hasSocial = config.socialProviders.length > 0;
	const showDivider = hasSocial && config.features.emailPassword;
	if (!showDivider) {
		hide(getEl("ba-signup-divider"));
	}

	// Hide footer in embed mode
	if (config.embed) {
		hide(getEl("ba-signup-footer"));
	}

	// Form submission handler
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);

		const name = getValue("ba-signup-name");
		const email = getValue("ba-signup-email");
		const password = getValue("ba-signup-password");
		const confirmPassword = getValue("ba-signup-confirm");

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

		setLoading(submitBtn, true, "Creating account...", "Create Account");

		const { error } = await authClient.signUp.email({
			name,
			email,
			password,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("SIGN_UP_ERROR", error.statusText, callbacks);
			setLoading(submitBtn, false, "Creating account...", "Create Account");
			return;
		}

		// Redirect based on email verification
		if (config.features.emailVerification) {
			const redirectUrl = `${config.paths.verifyEmail}?email=${encodeURIComponent(email)}`;
			handleSuccess(config, callbacks, redirectUrl);
		} else {
			handleSuccess(config, callbacks, config.redirectTo);
		}
	});

	// Passkey handler
	passkeyBtn?.addEventListener("click", async () => {
		hideError(errorContainer);
		setLoading(passkeyBtn, true, "Registering...", "Sign up with Passkey");

		const { error } = await authClient.passkey.register();

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("PASSKEY_ERROR", error.statusText, callbacks);
			setLoading(passkeyBtn, false, "Registering...", "Sign up with Passkey");
			return;
		}

		handleSuccess(config, callbacks, config.redirectTo);
	});
}

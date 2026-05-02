/**
 * Hydration handler for the sign-in page.
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
	isChecked,
	setHref,
	setLoading,
	showError,
} from "./core";

export function hydrateSignIn(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get elements
	const form = getEl<HTMLFormElement>("ba-signin-form");
	const submitBtn = getEl<HTMLButtonElement>("ba-signin-submit");
	const passkeyBtn = getEl<HTMLButtonElement>("ba-signin-passkey");
	const errorContainer = getEl("ba-signin-error");
	const errorMsg = getEl("ba-signin-error-msg");

	// Inject dynamic content
	injectLogo("ba-signin-logo", config);
	injectSocialButtons("ba-signin-social", config);
	setHref("ba-signin-forgot-link", config.paths.forgotPassword);
	setHref("ba-signin-signup-link", config.paths.signUp);

	// Hide features based on config
	if (!config.features.emailPassword) {
		hide(form);
	}
	if (!config.features.passkey) {
		hide(getEl("ba-signin-passkey-wrapper"));
	}
	if (!config.features.rememberMe) {
		hide(getEl("ba-signin-remember-wrapper"));
	}

	// Hide divider if no social or no email/password
	const hasSocial = config.socialProviders.length > 0;
	const showDivider = hasSocial && config.features.emailPassword;
	if (!showDivider) {
		hide(getEl("ba-signin-divider"));
	}

	// Hide footer in embed mode
	if (config.embed) {
		hide(getEl("ba-signin-footer"));
	}

	// Form submission handler
	form?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);
		setLoading(submitBtn, true, "Signing in...", "Continue");

		const email = getValue("ba-signin-email");
		const password = getValue("ba-signin-password");
		const rememberMe = isChecked("ba-signin-remember");

		const { error } = await authClient.signIn.email({
			email,
			password,
			rememberMe,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("SIGN_IN_ERROR", error.statusText, callbacks);
			setLoading(submitBtn, false, "Signing in...", "Continue");
			return;
		}

		handleSuccess(config, callbacks, config.redirectTo);
	});

	// Passkey handler
	passkeyBtn?.addEventListener("click", async () => {
		hideError(errorContainer);
		setLoading(passkeyBtn, true, "Authenticating...", "Sign in with Passkey");

		const { error } = await authClient.passkey.authenticate();

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("PASSKEY_ERROR", error.statusText, callbacks);
			setLoading(
				passkeyBtn,
				false,
				"Authenticating...",
				"Sign in with Passkey",
			);
			return;
		}

		handleSuccess(config, callbacks, config.redirectTo);
	});
}

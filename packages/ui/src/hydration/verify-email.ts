/**
 * Hydration handler for the verify-email page.
 * Handles automatic verification and manual resend.
 */

import type { BetterAuthUIConfig } from "../types/config";
import { authClient } from "./auth-client";
import type { HydrationCallbacks } from "./core";
import {
	getEl,
	getQueryParam,
	handleError,
	handleSuccess,
	hide,
	hideError,
	injectLogo,
	navigate,
	setLoading,
	setText,
	show,
	showError,
} from "./core";

export function hydrateVerifyEmail(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get token and email from URL or args
	const urlToken = getQueryParam("token");
	const urlEmail = getQueryParam("email");
	const token = (config.args?.token as string) || urlToken;
	const email = (config.args?.email as string) || urlEmail;

	// Get elements
	const loadingView = getEl("ba-verify-loading-view");
	const successView = getEl("ba-verify-success-view");
	const errorView = getEl("ba-verify-error-view");
	const pendingView = getEl("ba-verify-pending-view");
	const continueBtn = getEl<HTMLButtonElement>("ba-verify-continue-btn");
	const resendBtn = getEl<HTMLButtonElement>("ba-verify-resend-btn");
	const backBtn = getEl<HTMLButtonElement>("ba-verify-back-btn");
	const pendingResendBtn = getEl<HTMLButtonElement>(
		"ba-verify-pending-resend-btn",
	);
	const pendingBackBtn = getEl<HTMLButtonElement>("ba-verify-pending-back-btn");
	const pendingErrorContainer = getEl("ba-verify-pending-error");
	const pendingErrorMsg = getEl("ba-verify-pending-error-msg");

	// Inject logo
	injectLogo("ba-verify-logo", config);

	// Show email in pending view
	if (email) {
		setText(
			"ba-verify-pending-desc",
			`We've sent a verification link to ${email}. Click the link to verify your account.`,
		);
		show(pendingResendBtn);
	}

	// If we have a token, verify automatically
	if (token) {
		hide(pendingView);
		show(loadingView);

		void verifyEmail(token);
	}

	async function verifyEmail(verifyToken: string) {
		const { error } = await authClient.verifyEmail({ token: verifyToken });

		hide(loadingView);

		if (error) {
			show(errorView);
			setText("ba-verify-error-msg", error.statusText);
			handleError("VERIFY_EMAIL_ERROR", error.statusText, callbacks);

			// Show resend button if we have email
			if (email) {
				show(resendBtn);
			}
			return;
		}

		show(successView);
		handleSuccess(config, callbacks, config.redirectTo);
	}

	// Continue button
	continueBtn?.addEventListener("click", () => {
		navigate(config.redirectTo);
	});

	// Back buttons
	backBtn?.addEventListener("click", () => {
		navigate(config.paths.signIn);
	});

	pendingBackBtn?.addEventListener("click", () => {
		navigate(config.paths.signIn);
	});

	// Resend handlers
	async function handleResend(btn: HTMLButtonElement | null) {
		if (!email || !btn) return;

		hideError(pendingErrorContainer);
		setLoading(btn, true, "Sending...", "Resend Verification Email");

		const { error } = await authClient.sendVerificationEmail({ email });

		if (error) {
			showError(pendingErrorContainer, pendingErrorMsg, error.statusText);
			handleError("RESEND_EMAIL_ERROR", error.statusText, callbacks);
			setLoading(btn, false, "Sending...", "Resend Verification Email");
			return;
		}

		setLoading(btn, false, "Sending...", "Resend Verification Email");
		alert("Verification email sent!");
	}

	resendBtn?.addEventListener("click", () => handleResend(resendBtn));
	pendingResendBtn?.addEventListener("click", () =>
		handleResend(pendingResendBtn),
	);
}

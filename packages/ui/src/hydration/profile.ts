/**
 * Hydration handler for the profile page.
 * Handles profile updates, password changes, and sign out.
 */

import type { BetterAuthUIConfig } from "../types/config";
import type { User } from "./auth-client";
import { authClient } from "./auth-client";
import type { HydrationCallbacks } from "./core";
import {
	getEl,
	getValue,
	handleError,
	hide,
	hideError,
	hideSuccess,
	navigate,
	setLoading,
	setText,
	setValue,
	show,
	showError,
	showSuccess,
} from "./core";

export function hydrateProfile(
	config: BetterAuthUIConfig,
	callbacks: HydrationCallbacks = {},
): void {
	// Get elements
	const loadingView = getEl("ba-profile-loading-view");
	const mainView = getEl("ba-profile-main-view");
	const profileForm = getEl<HTMLFormElement>("ba-profile-form");
	const passwordForm = getEl<HTMLFormElement>("ba-profile-password-form");
	const profileSubmitBtn = getEl<HTMLButtonElement>("ba-profile-submit");
	const passwordSubmitBtn = getEl<HTMLButtonElement>(
		"ba-profile-password-submit",
	);
	const addPasskeyBtn = getEl<HTMLButtonElement>("ba-profile-add-passkey");
	const signOutBtn = getEl<HTMLButtonElement>("ba-profile-signout");
	const errorContainer = getEl("ba-profile-error");
	const errorMsg = getEl("ba-profile-error-msg");
	const successContainer = getEl("ba-profile-success");
	const successMsg = getEl("ba-profile-success-msg");

	// Show passkey card if enabled
	if (config.features.passkey) {
		show(getEl("ba-profile-passkey-card"));
	}

	// Fetch session on load
	void fetchSession();

	async function fetchSession() {
		const { data, error } = await authClient.getSession();

		if (error || !data) {
			navigate(config.paths.signIn);
			return;
		}

		const user = data.user as User;
		populateProfile(user);

		hide(loadingView);
		show(mainView);
	}

	function populateProfile(user: User) {
		// Set display values
		setText("ba-profile-display-name", user.name);
		setText("ba-profile-display-email", user.email);

		// Set form values
		setValue("ba-profile-name", user.name);
		setValue("ba-profile-image", user.image || "");
		setValue("ba-profile-email", user.email);

		// Set email verification status
		setText(
			"ba-profile-email-status",
			user.emailVerified ? "✓ Verified" : "Not verified",
		);

		// Set avatar
		const avatarImg = getEl<HTMLImageElement>("ba-profile-avatar-img");
		const avatarInitial = getEl("ba-profile-avatar-initial");

		if (user.image) {
			if (avatarImg) {
				avatarImg.src = user.image;
				avatarImg.alt = user.name;
				show(avatarImg);
			}
			hide(avatarInitial);
		} else {
			hide(avatarImg);
			if (avatarInitial) {
				avatarInitial.textContent = user.name.charAt(0).toUpperCase();
				show(avatarInitial);
			}
		}
	}

	// Profile form handler
	profileForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);
		hideSuccess(successContainer);
		setLoading(profileSubmitBtn, true, "Saving...", "Save Changes");

		const name = getValue("ba-profile-name");
		const image = getValue("ba-profile-image");

		const { data, error } = await authClient.updateUser({
			name,
			image: image || undefined,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("UPDATE_PROFILE_ERROR", error.statusText, callbacks);
			setLoading(profileSubmitBtn, false, "Saving...", "Save Changes");
			return;
		}

		if (data?.user) {
			populateProfile(data.user);
		}

		showSuccess(successContainer, successMsg, "Profile updated successfully");
		setLoading(profileSubmitBtn, false, "Saving...", "Save Changes");
	});

	// Password form handler
	passwordForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError(errorContainer);
		hideSuccess(successContainer);

		const currentPassword = getValue("ba-profile-current-password");
		const newPassword = getValue("ba-profile-new-password");
		const confirmPassword = getValue("ba-profile-confirm-password");

		// Validate passwords match
		if (newPassword !== confirmPassword) {
			showError(errorContainer, errorMsg, "Passwords do not match");
			return;
		}

		// Validate password length
		if (newPassword.length < config.minPasswordLength) {
			showError(
				errorContainer,
				errorMsg,
				`Password must be at least ${config.minPasswordLength} characters`,
			);
			return;
		}

		setLoading(passwordSubmitBtn, true, "Updating...", "Change Password");

		const { error } = await authClient.changePassword({
			currentPassword,
			newPassword,
		});

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("CHANGE_PASSWORD_ERROR", error.statusText, callbacks);
			setLoading(passwordSubmitBtn, false, "Updating...", "Change Password");
			return;
		}

		// Clear form
		passwordForm.reset();
		showSuccess(successContainer, successMsg, "Password changed successfully");
		setLoading(passwordSubmitBtn, false, "Updating...", "Change Password");
	});

	// Add passkey handler
	addPasskeyBtn?.addEventListener("click", async () => {
		hideError(errorContainer);
		hideSuccess(successContainer);

		const { error } = await authClient.passkey.addPasskey();

		if (error) {
			showError(errorContainer, errorMsg, error.statusText);
			handleError("ADD_PASSKEY_ERROR", error.statusText, callbacks);
			return;
		}

		showSuccess(successContainer, successMsg, "Passkey added successfully");
	});

	// Sign out handler
	signOutBtn?.addEventListener("click", async () => {
		const { error } = await authClient.signOut();

		if (error) {
			showError(errorContainer, errorMsg, "Failed to sign out");
			return;
		}

		navigate(config.paths.signIn);
	});
}

export const EVENT_TYPES = {
	USER_CREATED: "user_created",
	USER_SIGNED_IN: "user_signed_in",
	USER_SIGNED_OUT: "user_signed_out",
	USER_SIGN_IN_FAILED: "user_sign_in_failed",

	PASSWORD_RESET_REQUESTED: "password_reset_requested",
	PASSWORD_RESET_COMPLETED: "password_reset_completed",
	PASSWORD_CHANGED: "password_changed",

	EMAIL_VERIFICATION_SENT: "email_verification_sent",
	EMAIL_VERIFIED: "email_verified",
	EMAIL_CHANGED: "email_changed",

	PROFILE_UPDATED: "profile_updated",
	PROFILE_IMAGE_UPDATED: "profile_image_updated",

	SESSION_CREATED: "session_created",
	SESSION_REVOKED: "session_revoked",
	ALL_SESSIONS_REVOKED: "all_sessions_revoked",

	TWO_FACTOR_ENABLED: "two_factor_enabled",
	TWO_FACTOR_DISABLED: "two_factor_disabled",
	TWO_FACTOR_VERIFIED: "two_factor_verified",

	ACCOUNT_LINKED: "account_linked",
	ACCOUNT_UNLINKED: "account_unlinked",
	USER_BANNED: "user_banned",
	USER_UNBANNED: "user_unbanned",
	USER_DELETED: "user_deleted",

	USER_IMPERSONATED: "user_impersonated",
	USER_IMPERSONATED_STOPPED: "user_impersonated_stopped",
} as const;

export const UNKNOWN_USER = "unknown";
export const UNKNOWN_LOGIN = "unknown";

export const routes = {
	// Core auth routes
	SEND_VERIFICATION_EMAIL: "/send-verification-email",

	SIGN_IN: "/sign-in",
	SIGN_IN_EMAIL: "/sign-in/email",
	SIGN_IN_USERNAME: "/sign-in/username",
	SIGN_IN_EMAIL_OTP: "/sign-in/email-otp",
	SIGN_IN_SOCIAL: "/sign-in/social",
	SIGN_IN_ANONYMOUS: "/sign-in/anonymous",
	SIGN_IN_SOCIAL_CALLBACK: "/callback/:id",
	SIGN_IN_OAUTH_CALLBACK: "/oauth2/callback/:id",
	SIGN_OUT: "/sign-out",
	SIGN_UP: "/sign-up",
	SIGN_UP_EMAIL: "/sign-up/email",

	UPDATE_USER: "/update-user",
	CHANGE_EMAIL: "/change-email",
	VERIFY_EMAIL: "/verify-email",
	CHANGE_PASSWORD: "/change-password",
	SET_PASSWORD: "/set-password",
	RESET_PASSWORD: "/reset-password",
	REQUEST_PASSWORD_RESET: "/request-password-reset",

	REVOKE_ALL_SESSIONS: "/revoke-sessions",
	FORGET_PASSWORD: "/forget-password",

	// Passkey plugin routes
	SIGN_IN_PASSKEY: "/sign-in/passkey",
	PASSKEY_ADD: "/passkey/add-passkey",

	// Magic link plugin routes
	SIGN_IN_MAGIC_LINK: "/sign-in/magic-link",
	MAGIC_LINK_VERIFY: "/magic-link/verify",

	// SSO plugin routes
	SIGN_IN_SSO: "/sign-in/sso",

	// Two-factor plugin routes
	TWO_FACTOR_VERIFY_TOTP: "/two-factor/verify-totp",
	TWO_FACTOR_VERIFY_BACKUP: "/two-factor/verify-backup-code",
	TWO_FACTOR_VERIFY_OTP: "/two-factor/verify-otp",

	// Email OTP plugin routes
	EMAIL_OTP_SEND: "/email-otp/send-verification-otp",

	// Phone number plugin routes
	PHONE_SEND_OTP: "/phone-number/send-otp",
	PHONE_VERIFY_OTP: "/phone-number/verify-phone-number",

	// Organization plugin routes
	ORG_CREATE: "/organization/create",
	ORG_INVITE_MEMBER: "/organization/invite-member",

	// API key plugin routes
	API_KEY_CREATE: "/api-key/create",

	// Account linking
	LINK_SOCIAL: "/link-social",

	// Dash routes
	DASH_ROUTE: "/dash",
	DASH_UPDATE_USER: "/dash/update-user",
	DASH_REVOKE_SESSIONS_ALL: "/dash/sessions/revoke-all",
	DASH_DELETE_SESSIONS: "/dash/delete-sessions",
	DASH_BAN_USER: "/dash/ban-user",
	DASH_UNBAN_USER: "/dash/unban-user",

	// Admin routes
	ADMIN_ROUTE: "/admin",
	ADMIN_REVOKE_USER_SESSIONS: "/admin/revoke-user-sessions",
	ADMIN_SET_PASSWORD: "/admin/set-user-password",
	ADMIN_BAN_USER: "/admin/ban-user",
	ADMIN_UNBAN_USER: "/admin/unban-user",
};
export const ORGANIZATION_EVENT_TYPES = {
	// Organization events
	ORGANIZATION_CREATED: "organization_created",
	ORGANIZATION_UPDATED: "organization_updated",

	ORGANIZATION_MEMBER_ADDED: "organization_member_added",
	ORGANIZATION_MEMBER_REMOVED: "organization_member_removed",
	ORGANIZATION_MEMBER_ROLE_UPDATED: "organization_member_role_updated",

	ORGANIZATION_MEMBER_INVITED: "organization_member_invited",
	ORGANIZATION_MEMBER_INVITE_CANCELED: "organization_member_invite_canceled",
	ORGANIZATION_MEMBER_INVITE_ACCEPTED: "organization_member_invite_accepted",
	ORGANIZATION_MEMBER_INVITE_REJECTED: "organization_member_invite_rejected",

	ORGANIZATION_TEAM_CREATED: "organization_team_created",
	ORGANIZATION_TEAM_UPDATED: "organization_team_updated",
	ORGANIZATION_TEAM_DELETED: "organization_team_deleted",

	ORGANIZATION_TEAM_MEMBER_ADDED: "organization_team_member_added",
	ORGANIZATION_TEAM_MEMBER_REMOVED: "organization_team_member_removed",
} as const;

export const organizationRoutes = {
	ORG_ROUTE: "/organization",
	DASH_ROUTE: "/dash/organization",
};

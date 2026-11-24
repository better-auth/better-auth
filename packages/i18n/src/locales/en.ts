import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { SSO_ERROR_CODES } from "@better-auth/sso";
import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { CAPTCHA_ERROR_CODES } from "better-auth/plugins/captcha";
import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { EMAIL_OTP_ERROR_CODES } from "better-auth/plugins/email-otp";
import type { GENERIC_OAUTH_ERROR_CODES } from "better-auth/plugins/generic-oauth";
import type { HAVE_I_BEEN_PWNED_ERROR_CODES } from "better-auth/plugins/haveibeenpwned";
import type { MULTI_SESSION_ERROR_CODES } from "better-auth/plugins/multi-session";
import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type {
	CompleteTranslationDictionary,
	LocalizedTranslations,
} from "../types";

const enCore: LocalizedTranslations<typeof BASE_ERROR_CODES> = {
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	FAILED_TO_UPDATE_USER: "Failed to update user",
	FAILED_TO_DELETE_USER: "Failed to delete user",
	FAILED_TO_GET_SESSION: "Failed to get session",
	INVALID_PASSWORD: "Invalid password",
	INVALID_EMAIL: "Invalid email",
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	INVALID_USER: "Invalid user",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	PROVIDER_NOT_FOUND: "Provider not found",
	INVALID_TOKEN: "Invalid token",
	TOKEN_EXPIRED: "Token expired",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported",
	FAILED_TO_GET_USER_INFO: "Failed to get user info",
	USER_EMAIL_NOT_FOUND: "User email not found",
	EMAIL_NOT_VERIFIED: "Email not verified",
	PASSWORD_TOO_SHORT: "Password too short",
	PASSWORD_TOO_LONG: "Password too long",
	USER_ALREADY_EXISTS: "User already exists",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
	EMAIL_CAN_NOT_BE_UPDATED: "Email cannot be updated",
	CHANGE_EMAIL_DISABLED: "Change email is disabled",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	SESSION_EXPIRED: "Session expired. Re-authenticate to perform this action.",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "You can't unlink your last account",
	ACCOUNT_NOT_FOUND: "Account not found",
	USER_ALREADY_HAS_PASSWORD:
		"User already has a password. Provide that to delete the account.",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
	VERIFICATION_EMAIL_NOT_ENABLED: "Verification email isn't enabled",
	EMAIL_ALREADY_VERIFIED: "Email is already verified",
	EMAIL_MISMATCH: "Email mismatch",
	SESSION_NOT_FRESH: "Session is not fresh",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Linked account already exists",
	INVALID_ORIGIN: "Invalid origin",
	INVALID_CALLBACK_URL: "Invalid callbackURL",
	INVALID_REDIRECT_URL: "Invalid redirectURL",
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL",
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL",
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin",
	CALLBACK_URL_REQUIRED: "callbackURL is required",
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification",
	FIELD_NOT_ALLOWED: "Field not allowed to be set",
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported",
	VALIDATION_ERROR: "Validation error",
	MISSING_FIELD: "Field is required",
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
		"POST method requires deferSessionRefresh to be enabled in session config",
	BODY_MUST_BE_AN_OBJECT: "Body must be an object",
	PASSWORD_ALREADY_SET: "User already has a password set",
};

const enAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Failed to create user",
	USER_ALREADY_EXISTS: "User already exists",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
	YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"You are not allowed to change users role",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"You are not allowed to list users sessions",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"You are not allowed to impersonate users",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"You are not allowed to revoke users sessions",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"You are not allowed to set users password",
	BANNED_USER: "You have been banned from this application",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
	NO_DATA_TO_UPDATE: "No data to update",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
	YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"You are not allowed to set a non-existent role value",
	YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins",
	INVALID_ROLE_TYPE: "Invalid role type",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"You are not allowed to update users email",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PHONE_NUMBER:
		"You are not allowed to update users phone number",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Password cannot be updated through update-user. Use the set-user-password endpoint instead",
	USER_ID_CANNOT_BE_UPDATED: "User id cannot be updated",
};

const enAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> = {
	INVALID_EMAIL_FORMAT: "Email was not generated in a valid format",
	FAILED_TO_CREATE_USER: "Failed to create user",
	COULD_NOT_CREATE_SESSION: "Could not create session",
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously",
	FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user",
	FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
		"Failed to delete anonymous user sessions",
	USER_IS_NOT_ANONYMOUS: "User is not anonymous",
	DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled",
};

const enApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata must be an object or undefined",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is required when refillInterval is provided",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is required when refillAmount is provided",
	USER_BANNED: "User is banned",
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session",
	KEY_NOT_FOUND: "API Key not found",
	KEY_DISABLED: "API Key is disabled",
	KEY_EXPIRED: "API Key has expired",
	USAGE_EXCEEDED: "API Key has reached its usage limit",
	KEY_NOT_RECOVERABLE: "API Key is not recoverable",
	EXPIRES_IN_IS_TOO_SMALL:
		"The expiresIn is smaller than the predefined minimum value.",
	EXPIRES_IN_IS_TOO_LARGE:
		"The expiresIn is larger than the predefined maximum value.",
	INVALID_REMAINING: "The remaining count is either too large or too small.",
	INVALID_PREFIX_LENGTH: "The prefix length is either too large or too small.",
	INVALID_NAME_LENGTH: "The name length is either too large or too small.",
	METADATA_DISABLED: "Metadata is disabled.",
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded.",
	NO_VALUES_TO_UPDATE: "No values to update.",
	KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.",
	INVALID_API_KEY: "Invalid API key.",
	INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"The reference id from the API key is invalid.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Key getter returned an invalid key type. Expected string.",
	SERVER_ONLY_PROPERTY:
		"The property you're trying to set can only be set from the server auth instance only.",
	FAILED_TO_UPDATE_API_KEY: "Failed to update API key",
	NAME_REQUIRED: "API Key name is required.",
	ORGANIZATION_ID_REQUIRED:
		"Organization ID is required for organization-owned API keys.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"You are not a member of the organization that owns this API key.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"You do not have permission to perform this action on organization API keys.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"No default api-key configuration found.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Organization plugin is required for organization-owned API keys. Please install and configure the organization plugin.",
};

const enCaptcha: LocalizedTranslations<typeof CAPTCHA_ERROR_CODES> = {
	VERIFICATION_FAILED: "Captcha verification failed",
	MISSING_RESPONSE: "Missing CAPTCHA response",
	UNKNOWN_ERROR: "Unknown error",
};

const enDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Invalid device code",
	EXPIRED_DEVICE_CODE: "Device code has expired",
	EXPIRED_USER_CODE: "User code has expired",
	AUTHORIZATION_PENDING: "Authorization pending",
	ACCESS_DENIED: "Access denied",
	INVALID_USER_CODE: "Invalid user code",
	DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed",
	DEVICE_CODE_NOT_CLAIMED:
		"Device code has not been claimed by a verifying session; call `GET /device` with the `user_code` while signed in before approving or denying",
	POLLING_TOO_FREQUENTLY: "Polling too frequently",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	INVALID_DEVICE_CODE_STATUS: "Invalid device code status",
	AUTHENTICATION_REQUIRED: "Authentication required",
};

const enElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Invalid client ID",
	INVALID_TOKEN: "Invalid token",
	STATE_MISMATCH: "state mismatch",
	MISSING_CODE_CHALLENGE: "missing code challenge",
	INVALID_CODE_VERIFIER: "Invalid code verifier",
	MISSING_STATE: "state is required",
	MISSING_PKCE: "pkce is required",
};

const enEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	TOO_MANY_ATTEMPTS: "Too many attempts",
};

const enGenericOAuth: LocalizedTranslations<typeof GENERIC_OAUTH_ERROR_CODES> =
	{
		INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration",
		TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.",
	};

const enHaveIBeenPwned: LocalizedTranslations<
	typeof HAVE_I_BEEN_PWNED_ERROR_CODES
> = {
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.",
};

const enMultiSession: LocalizedTranslations<typeof MULTI_SESSION_ERROR_CODES> =
	{
		INVALID_SESSION_TOKEN: "Invalid session token",
	};

const enOauthPopup: LocalizedTranslations<typeof OAUTH_POPUP_ERROR_CODES> = {
	POPUP_SIGN_IN_FAILED: "Popup sign-in failed",
	POPUP_BLOCKED: "Sign-in popup was blocked by the browser",
	POPUP_CLOSED: "Sign-in popup was closed before completing",
	POPUP_TIMEOUT: "Sign-in popup timed out",
};

const enOrganization: LocalizedTranslations<typeof ORGANIZATION_ERROR_CODES> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"You are not allowed to create a new organization",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"You have reached the maximum number of organizations",
	ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
	ORGANIZATION_NOT_FOUND: "Organization not found",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"User is not a member of the organization",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"You are not allowed to update this organization",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"You are not allowed to delete this organization",
	NO_ACTIVE_ORGANIZATION: "No active organization",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"User is already a member of this organization",
	MEMBER_NOT_FOUND: "Member not found",
	ROLE_NOT_FOUND: "Role not found",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"You are not allowed to create a new team",
	TEAM_ALREADY_EXISTS: "Team already exists",
	TEAM_NOT_FOUND: "Team not found",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"You cannot leave the organization as the only owner",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"You cannot leave the organization without an owner",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"You are not allowed to delete this member",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"You are not allowed to invite users to this organization",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"User is already invited to this organization",
	INVITATION_NOT_FOUND: "Invitation not found",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"You are not the recipient of the invitation",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Email verification required before accepting or rejecting invitation",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Email verification required to view or list invitations for the session email",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"You are not allowed to cancel this invitation",
	YOU_ARE_NOT_ALLOWED_TO_LIST_INVITATIONS:
		"You are not allowed to list invitations for this organization",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Inviter is no longer a member of the organization",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"You are not allowed to invite a user with this role",
	FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"You have reached the maximum number of teams",
	UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"You are not allowed to update this member",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organization membership limit reached",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to create teams in this organization",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to delete teams in this organization",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"You are not allowed to update this team",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"You are not allowed to delete this team",
	INVITATION_LIMIT_REACHED: "Invitation limit reached",
	TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"You are not allowed to list the members of this team",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"You are not allowed to create a new member",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"You are not allowed to remove a team member",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"You are not allowed to access this organization as an owner",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"You are not a member of this organization",
	MISSING_AC_INSTANCE:
		"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"You must be in an organization to create a role",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "You are not allowed to create a role",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "You are not allowed to update a role",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "You are not allowed to delete a role",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
	TOO_MANY_ROLES: "This organization has too many roles",
	INVALID_RESOURCE: "The provided permission includes an invalid resource",
	ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Cannot delete a role that is assigned to members. Please reassign the members to a different role first",
	INVALID_TEAM_ID: "Team id contains a reserved character",
};

const enPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	ORIGIN_NOT_CONFIGURED:
		"Passkey origin is not configured. Set the `origin` option of the passkey plugin or configure `baseURL`.",
	CHALLENGE_NOT_FOUND: "Challenge not found",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"You are not allowed to register this passkey",
	FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
	PASSKEY_NOT_FOUND: "Passkey not found",
	AUTHENTICATION_FAILED: "Authentication failed",
	UNABLE_TO_CREATE_SESSION: "Unable to create session",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
	PREVIOUSLY_REGISTERED: "Previously registered",
	REGISTRATION_CANCELLED: "Registration cancelled",
	AUTH_CANCELLED: "Auth cancelled",
	UNKNOWN_ERROR: "Unknown error",
	SESSION_REQUIRED: "Passkey registration requires an authenticated session",
	RESOLVE_USER_REQUIRED:
		"Passkey registration requires either an authenticated session or a resolveUser callback when requireSession is false",
	RESOLVED_USER_INVALID: "Resolved user is invalid",
};

const enPhoneNumber: LocalizedTranslations<typeof PHONE_NUMBER_ERROR_CODES> = {
	INVALID_PHONE_NUMBER: "Invalid phone number",
	PHONE_NUMBER_EXIST: "Phone number already exists",
	PHONE_NUMBER_NOT_EXIST: "phone number isn't registered",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Invalid phone number or password",
	UNEXPECTED_ERROR: "Unexpected error",
	OTP_NOT_FOUND: "OTP not found",
	OTP_EXPIRED: "OTP expired",
	INVALID_OTP: "Invalid OTP",
	PHONE_NUMBER_NOT_VERIFIED: "Phone number not verified",
	PHONE_NUMBER_PENDING_VERIFICATION:
		"Phone number requires account ownership proof",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Phone number cannot be updated",
	PHONE_NUMBER_CANNOT_BE_SET: "Phone number can only be set by verifying it",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP not implemented",
	TOO_MANY_ATTEMPTS: "Too many attempts",
};

const enSso: LocalizedTranslations<typeof SSO_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is not enabled",
	INVALID_LOGOUT_RESPONSE: "Invalid LogoutResponse",
	INVALID_LOGOUT_REQUEST: "Invalid LogoutRequest",
	LOGOUT_FAILED_AT_IDP: "Logout failed at IdP",
	IDP_SLO_NOT_SUPPORTED: "IdP does not support Single Logout Service",
	SAML_PROVIDER_NOT_FOUND: "SAML provider not found",
	CERT_SOURCE_MISSING:
		"samlConfig requires either a signing certificate (cert or idpMetadata.cert) or an idpMetadata.metadata XML document.",
};

const enStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Unauthorized access",
	INVALID_REQUEST_BODY: "Invalid request body",
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	REFERENCE_ID_NOT_ALLOWED: "Reference id is not allowed",
	CUSTOMER_NOT_FOUND: "Stripe customer not found for this user",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Unable to create billing portal session",
	STRIPE_SIGNATURE_NOT_FOUND: "Stripe signature not found",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found",
	STRIPE_WEBHOOK_ERROR: "Stripe webhook error",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Failed to construct Stripe event",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Subscription has no pending cancellation or scheduled plan change",
	ORGANIZATION_NOT_FOUND: "Organization not found",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Organization subscription is not enabled",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Organization subscriptions require authorizeReference callback to be configured",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Cannot delete organization with active subscription",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Reference ID is required. Provide referenceId or set activeOrganizationId in session",
};

const enTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> = {
	OTP_NOT_ENABLED: "OTP not enabled",
	OTP_NOT_CONFIGURED: "OTP is not available",
	OTP_HAS_EXPIRED: "OTP has expired",
	TOTP_NOT_ENABLED: "TOTP not enabled",
	TOTP_ALREADY_ENABLED: "TOTP is already enabled",
	TOTP_NOT_CONFIGURED: "TOTP is not available",
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled",
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled",
	INVALID_BACKUP_CODE: "Invalid backup code",
	INVALID_CODE: "Invalid code",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.",
	ACCOUNT_TEMPORARILY_LOCKED:
		"Too many failed verification attempts. Your account is temporarily locked. Please try again later.",
	INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie",
};

const enUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Invalid username or password",
	EMAIL_NOT_VERIFIED: "Email not verified",
	UNEXPECTED_ERROR: "Unexpected error",
	USERNAME_IS_ALREADY_TAKEN: "Username is already taken. Please try another.",
	USERNAME_TOO_SHORT: "Username is too short",
	USERNAME_TOO_LONG: "Username is too long",
	INVALID_USERNAME: "Username is invalid",
	INVALID_DISPLAY_USERNAME: "Display username is invalid",
	USERNAME_IS_IMMUTABLE: "Username cannot be updated",
};

/**
 * English translations (default)
 */
export const en: CompleteTranslationDictionary = {
	...enCore,
	...enAdmin,
	...enAnonymous,
	...enApiKey,
	...enCaptcha,
	...enDeviceAuthorization,
	...enElectron,
	...enEmailOtp,
	...enGenericOAuth,
	...enHaveIBeenPwned,
	...enMultiSession,
	...enOauthPopup,
	...enOrganization,
	...enPasskey,
	...enPhoneNumber,
	...enSso,
	...enStripe,
	...enTwoFactor,
	...enUsername,
};

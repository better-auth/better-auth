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

const hiCore: LocalizedTranslations<typeof BASE_ERROR_CODES> = {
	USER_NOT_FOUND: "उपयोगकर्ता नहीं मिला",
	FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
	FAILED_TO_CREATE_SESSION: "सत्र बनाने में विफल",
	FAILED_TO_UPDATE_USER: "उपयोगकर्ता अपडेट करने में विफल",
	FAILED_TO_DELETE_USER: "उपयोगकर्ता हटाने में विफल",
	FAILED_TO_GET_SESSION: "सत्र प्राप्त करने में विफल",
	INVALID_PASSWORD: "अमान्य पासवर्ड",
	INVALID_EMAIL: "अमान्य ईमेल",
	INVALID_EMAIL_OR_PASSWORD: "अमान्य ईमेल या पासवर्ड",
	INVALID_USER: "अमान्य उपयोगकर्ता",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "सोशल अकाउंट पहले से लिंक है",
	PROVIDER_NOT_FOUND: "प्रदाता नहीं मिला",
	INVALID_TOKEN: "अमान्य टोकन",
	TOKEN_EXPIRED: "टोकन समाप्त हो गया",
	ID_TOKEN_NOT_SUPPORTED: "id_token not supported", // TODO: translate
	FAILED_TO_GET_USER_INFO: "उपयोगकर्ता जानकारी प्राप्त करने में विफल",
	USER_EMAIL_NOT_FOUND: "उपयोगकर्ता का ईमेल नहीं मिला",
	EMAIL_NOT_VERIFIED: "ईमेल सत्यापित नहीं है",
	PASSWORD_TOO_SHORT: "पासवर्ड बहुत छोटा है",
	PASSWORD_TOO_LONG: "पासवर्ड बहुत लंबा है",
	USER_ALREADY_EXISTS: "उपयोगकर्ता पहले से मौजूद है",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"उपयोगकर्ता पहले से मौजूद है। कोई अन्य ईमेल उपयोग करें।",
	EMAIL_CAN_NOT_BE_UPDATED: "ईमेल अपडेट नहीं किया जा सकता",
	CHANGE_EMAIL_DISABLED: "Change email is disabled", // TODO: translate
	CREDENTIAL_ACCOUNT_NOT_FOUND: "क्रेडेंशियल अकाउंट नहीं मिला",
	SESSION_EXPIRED: "सत्र समाप्त हो गया। इस क्रिया को करने के लिए पुनः प्रमाणित करें।",
	FAILED_TO_UNLINK_LAST_ACCOUNT: "आप अपने अंतिम अकाउंट को अनलिंक नहीं कर सकते",
	ACCOUNT_NOT_FOUND: "अकाउंट नहीं मिला",
	USER_ALREADY_HAS_PASSWORD:
		"उपयोगकर्ता के पास पहले से पासवर्ड है। अकाउंट हटाने के लिए वह दर्ज करें।",
	CROSS_SITE_NAVIGATION_LOGIN_BLOCKED:
		"Cross-site navigation login blocked. This request appears to be a CSRF attack.", // TODO: translate
	VERIFICATION_EMAIL_NOT_ENABLED: "सत्यापन ईमेल सक्षम नहीं है",
	EMAIL_ALREADY_VERIFIED: "ईमेल पहले से सत्यापित है",
	EMAIL_MISMATCH: "ईमेल मेल नहीं खाता",
	SESSION_NOT_FRESH: "सत्र ताजा नहीं है",
	LINKED_ACCOUNT_ALREADY_EXISTS: "लिंक किया गया अकाउंट पहले से मौजूद है",
	INVALID_ORIGIN: "Invalid origin", // TODO: translate
	INVALID_CALLBACK_URL: "Invalid callbackURL", // TODO: translate
	INVALID_REDIRECT_URL: "Invalid redirectURL", // TODO: translate
	INVALID_ERROR_CALLBACK_URL: "Invalid errorCallbackURL", // TODO: translate
	INVALID_NEW_USER_CALLBACK_URL: "Invalid newUserCallbackURL", // TODO: translate
	MISSING_OR_NULL_ORIGIN: "Missing or null Origin", // TODO: translate
	CALLBACK_URL_REQUIRED: "callbackURL is required", // TODO: translate
	FAILED_TO_CREATE_VERIFICATION: "Unable to create verification", // TODO: translate
	FIELD_NOT_ALLOWED: "Field not allowed to be set", // TODO: translate
	ASYNC_VALIDATION_NOT_SUPPORTED: "Async validation is not supported", // TODO: translate
	VALIDATION_ERROR: "सत्यापन त्रुटि",
	MISSING_FIELD: "यह फ़ील्ड आवश्यक है",
	METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED:
		"POST method requires deferSessionRefresh to be enabled in session config", // TODO: translate
	BODY_MUST_BE_AN_OBJECT: "Body must be an object", // TODO: translate
	PASSWORD_ALREADY_SET: "उपयोगकर्ता का पासवर्ड पहले से सेट है",
};

const hiAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
	USER_ALREADY_EXISTS: "उपयोगकर्ता पहले से मौजूद है",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"उपयोगकर्ता पहले से मौजूद है। कोई अन्य ईमेल उपयोग करें।",
	YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"You are not allowed to change users role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"You are not allowed to list users sessions", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"You are not allowed to impersonate users", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"You are not allowed to revoke users sessions", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"You are not allowed to set users password", // TODO: translate
	BANNED_USER: "You have been banned from this application", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user", // TODO: translate
	NO_DATA_TO_UPDATE: "No data to update", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users", // TODO: translate
	YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"You are not allowed to set a non-existent role value", // TODO: translate
	YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins", // TODO: translate
	INVALID_ROLE_TYPE: "Invalid role type", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"You are not allowed to update users email", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PHONE_NUMBER:
		"You are not allowed to update users phone number", // TODO: translate
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Password cannot be updated through update-user. Use the set-user-password endpoint instead", // TODO: translate
	USER_ID_CANNOT_BE_UPDATED: "User id cannot be updated", // TODO: translate
};

const hiAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> = {
	INVALID_EMAIL_FORMAT: "Email was not generated in a valid format", // TODO: translate
	FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
	COULD_NOT_CREATE_SESSION: "Could not create session", // TODO: translate
	ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
		"Anonymous users cannot sign in again anonymously", // TODO: translate
	FAILED_TO_DELETE_ANONYMOUS_USER: "Failed to delete anonymous user", // TODO: translate
	FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
		"Failed to delete anonymous user sessions", // TODO: translate
	USER_IS_NOT_ANONYMOUS: "User is not anonymous", // TODO: translate
	DELETE_ANONYMOUS_USER_DISABLED: "Deleting anonymous users is disabled", // TODO: translate
};

const hiApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata must be an object or undefined", // TODO: translate
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is required when refillInterval is provided", // TODO: translate
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is required when refillAmount is provided", // TODO: translate
	USER_BANNED: "User is banned", // TODO: translate
	UNAUTHORIZED_SESSION: "Unauthorized or invalid session", // TODO: translate
	KEY_NOT_FOUND: "API Key not found", // TODO: translate
	KEY_DISABLED: "API Key is disabled", // TODO: translate
	KEY_EXPIRED: "API Key has expired", // TODO: translate
	USAGE_EXCEEDED: "API Key has reached its usage limit", // TODO: translate
	KEY_NOT_RECOVERABLE: "API Key is not recoverable", // TODO: translate
	EXPIRES_IN_IS_TOO_SMALL:
		"The expiresIn is smaller than the predefined minimum value.", // TODO: translate
	EXPIRES_IN_IS_TOO_LARGE:
		"The expiresIn is larger than the predefined maximum value.", // TODO: translate
	INVALID_REMAINING: "The remaining count is either too large or too small.", // TODO: translate
	INVALID_PREFIX_LENGTH: "The prefix length is either too large or too small.", // TODO: translate
	INVALID_NAME_LENGTH: "The name length is either too large or too small.", // TODO: translate
	METADATA_DISABLED: "Metadata is disabled.", // TODO: translate
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded.", // TODO: translate
	NO_VALUES_TO_UPDATE: "No values to update.", // TODO: translate
	KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.", // TODO: translate
	INVALID_API_KEY: "Invalid API key.", // TODO: translate
	INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.", // TODO: translate
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"The reference id from the API key is invalid.", // TODO: translate
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API Key getter returned an invalid key type. Expected string.", // TODO: translate
	SERVER_ONLY_PROPERTY:
		"The property you're trying to set can only be set from the server auth instance only.", // TODO: translate
	FAILED_TO_UPDATE_API_KEY: "Failed to update API key", // TODO: translate
	NAME_REQUIRED: "API Key name is required.", // TODO: translate
	ORGANIZATION_ID_REQUIRED:
		"Organization ID is required for organization-owned API keys.", // TODO: translate
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"You are not a member of the organization that owns this API key.", // TODO: translate
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"You do not have permission to perform this action on organization API keys.", // TODO: translate
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"No default api-key configuration found.", // TODO: translate
	ORGANIZATION_PLUGIN_REQUIRED:
		"Organization plugin is required for organization-owned API keys. Please install and configure the organization plugin.", // TODO: translate
};

const hiCaptcha: LocalizedTranslations<typeof CAPTCHA_ERROR_CODES> = {
	VERIFICATION_FAILED: "Captcha verification failed", // TODO: translate
	MISSING_RESPONSE: "Missing CAPTCHA response", // TODO: translate
	UNKNOWN_ERROR: "Unknown error", // TODO: translate
};

const hiDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Invalid device code", // TODO: translate
	EXPIRED_DEVICE_CODE: "Device code has expired", // TODO: translate
	EXPIRED_USER_CODE: "User code has expired", // TODO: translate
	AUTHORIZATION_PENDING: "Authorization pending", // TODO: translate
	ACCESS_DENIED: "Access denied", // TODO: translate
	INVALID_USER_CODE: "Invalid user code", // TODO: translate
	DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed", // TODO: translate
	DEVICE_CODE_NOT_CLAIMED:
		"Device code has not been claimed by a verifying session; call `GET /device` with the `user_code` while signed in before approving or denying", // TODO: translate
	POLLING_TOO_FREQUENTLY: "Polling too frequently", // TODO: translate
	USER_NOT_FOUND: "उपयोगकर्ता नहीं मिला",
	FAILED_TO_CREATE_SESSION: "सत्र बनाने में विफल",
	INVALID_DEVICE_CODE_STATUS: "Invalid device code status", // TODO: translate
	AUTHENTICATION_REQUIRED: "Authentication required", // TODO: translate
};

const hiElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Invalid client ID", // TODO: translate
	INVALID_TOKEN: "अमान्य टोकन",
	STATE_MISMATCH: "state mismatch", // TODO: translate
	MISSING_CODE_CHALLENGE: "missing code challenge", // TODO: translate
	INVALID_CODE_VERIFIER: "Invalid code verifier", // TODO: translate
	MISSING_STATE: "state is required", // TODO: translate
	MISSING_PKCE: "pkce is required", // TODO: translate
};

const hiEmailOtp: LocalizedTranslations<typeof EMAIL_OTP_ERROR_CODES> = {
	OTP_EXPIRED: "OTP expired", // TODO: translate
	INVALID_OTP: "Invalid OTP", // TODO: translate
	TOO_MANY_ATTEMPTS: "Too many attempts", // TODO: translate
};

const hiGenericOAuth: LocalizedTranslations<typeof GENERIC_OAUTH_ERROR_CODES> =
	{
		INVALID_OAUTH_CONFIGURATION: "Invalid OAuth configuration", // TODO: translate
		TOKEN_URL_NOT_FOUND: "Invalid OAuth configuration. Token URL not found.", // TODO: translate
	};

const hiHaveIBeenPwned: LocalizedTranslations<
	typeof HAVE_I_BEEN_PWNED_ERROR_CODES
> = {
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.", // TODO: translate
};

const hiMultiSession: LocalizedTranslations<typeof MULTI_SESSION_ERROR_CODES> =
	{
		INVALID_SESSION_TOKEN: "Invalid session token", // TODO: translate
	};

const hiOauthPopup: LocalizedTranslations<typeof OAUTH_POPUP_ERROR_CODES> = {
	POPUP_SIGN_IN_FAILED: "Popup sign-in failed", // TODO: translate
	POPUP_BLOCKED: "Sign-in popup was blocked by the browser", // TODO: translate
	POPUP_CLOSED: "Sign-in popup was closed before completing", // TODO: translate
	POPUP_TIMEOUT: "Sign-in popup timed out", // TODO: translate
};

const hiOrganization: LocalizedTranslations<typeof ORGANIZATION_ERROR_CODES> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"You are not allowed to create a new organization", // TODO: translate
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"You have reached the maximum number of organizations", // TODO: translate
	ORGANIZATION_ALREADY_EXISTS: "Organization already exists", // TODO: translate
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken", // TODO: translate
	ORGANIZATION_NOT_FOUND: "Organization not found", // TODO: translate
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"User is not a member of the organization", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"You are not allowed to update this organization", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"You are not allowed to delete this organization", // TODO: translate
	NO_ACTIVE_ORGANIZATION: "No active organization", // TODO: translate
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"User is already a member of this organization", // TODO: translate
	MEMBER_NOT_FOUND: "Member not found", // TODO: translate
	ROLE_NOT_FOUND: "Role not found", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"You are not allowed to create a new team", // TODO: translate
	TEAM_ALREADY_EXISTS: "Team already exists", // TODO: translate
	TEAM_NOT_FOUND: "Team not found", // TODO: translate
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"You cannot leave the organization as the only owner", // TODO: translate
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"You cannot leave the organization without an owner", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"You are not allowed to delete this member", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"You are not allowed to invite users to this organization", // TODO: translate
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"User is already invited to this organization", // TODO: translate
	INVITATION_NOT_FOUND: "Invitation not found", // TODO: translate
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"You are not the recipient of the invitation", // TODO: translate
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Email verification required before accepting or rejecting invitation", // TODO: translate
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Email verification required to view or list invitations for the session email", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"You are not allowed to cancel this invitation", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_LIST_INVITATIONS:
		"You are not allowed to list invitations for this organization", // TODO: translate
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Inviter is no longer a member of the organization", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"You are not allowed to invite a user with this role", // TODO: translate
	FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation", // TODO: translate
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"You have reached the maximum number of teams", // TODO: translate
	UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"You are not allowed to update this member", // TODO: translate
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organization membership limit reached", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to create teams in this organization", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"You are not allowed to delete teams in this organization", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"You are not allowed to update this team", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"You are not allowed to delete this team", // TODO: translate
	INVITATION_LIMIT_REACHED: "Invitation limit reached", // TODO: translate
	TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached", // TODO: translate
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team", // TODO: translate
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"You are not allowed to list the members of this team", // TODO: translate
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"You are not allowed to create a new member", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"You are not allowed to remove a team member", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"You are not allowed to access this organization as an owner", // TODO: translate
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"You are not a member of this organization", // TODO: translate
	MISSING_AC_INSTANCE:
		"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information", // TODO: translate
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"You must be in an organization to create a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "You are not allowed to create a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "You are not allowed to update a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "You are not allowed to delete a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role", // TODO: translate
	TOO_MANY_ROLES: "This organization has too many roles", // TODO: translate
	INVALID_RESOURCE: "The provided permission includes an invalid resource", // TODO: translate
	ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken", // TODO: translate
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role", // TODO: translate
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Cannot delete a role that is assigned to members. Please reassign the members to a different role first", // TODO: translate
	INVALID_TEAM_ID: "Team id contains a reserved character", // TODO: translate
};

const hiPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	ORIGIN_NOT_CONFIGURED:
		"Passkey origin is not configured. Set the `origin` option of the passkey plugin or configure `baseURL`.", // TODO: translate
	CHALLENGE_NOT_FOUND: "Challenge not found", // TODO: translate
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"You are not allowed to register this passkey", // TODO: translate
	FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration", // TODO: translate
	PASSKEY_NOT_FOUND: "Passkey not found", // TODO: translate
	AUTHENTICATION_FAILED: "Authentication failed", // TODO: translate
	UNABLE_TO_CREATE_SESSION: "Unable to create session", // TODO: translate
	USER_NOT_FOUND: "उपयोगकर्ता नहीं मिला",
	FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey", // TODO: translate
	PREVIOUSLY_REGISTERED: "Previously registered", // TODO: translate
	REGISTRATION_CANCELLED: "Registration cancelled", // TODO: translate
	AUTH_CANCELLED: "Auth cancelled", // TODO: translate
	UNKNOWN_ERROR: "Unknown error", // TODO: translate
	SESSION_REQUIRED: "Passkey registration requires an authenticated session", // TODO: translate
	RESOLVE_USER_REQUIRED:
		"Passkey registration requires either an authenticated session or a resolveUser callback when requireSession is false", // TODO: translate
	RESOLVED_USER_INVALID: "Resolved user is invalid", // TODO: translate
};

const hiPhoneNumber: LocalizedTranslations<typeof PHONE_NUMBER_ERROR_CODES> = {
	INVALID_PHONE_NUMBER: "Invalid phone number", // TODO: translate
	PHONE_NUMBER_EXIST: "Phone number already exists", // TODO: translate
	PHONE_NUMBER_NOT_EXIST: "phone number isn't registered", // TODO: translate
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Invalid phone number or password", // TODO: translate
	UNEXPECTED_ERROR: "Unexpected error", // TODO: translate
	OTP_NOT_FOUND: "OTP not found", // TODO: translate
	OTP_EXPIRED: "OTP expired", // TODO: translate
	INVALID_OTP: "Invalid OTP", // TODO: translate
	PHONE_NUMBER_NOT_VERIFIED: "Phone number not verified", // TODO: translate
	PHONE_NUMBER_PENDING_VERIFICATION:
		"Phone number requires account ownership proof", // TODO: translate
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Phone number cannot be updated", // TODO: translate
	PHONE_NUMBER_CANNOT_BE_SET: "Phone number can only be set by verifying it", // TODO: translate
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP not implemented", // TODO: translate
	TOO_MANY_ATTEMPTS: "Too many attempts", // TODO: translate
};

const hiSso: LocalizedTranslations<typeof SSO_ERROR_CODES> = {
	SINGLE_LOGOUT_NOT_ENABLED: "Single Logout is not enabled", // TODO: translate
	INVALID_LOGOUT_RESPONSE: "Invalid LogoutResponse", // TODO: translate
	INVALID_LOGOUT_REQUEST: "Invalid LogoutRequest", // TODO: translate
	LOGOUT_FAILED_AT_IDP: "Logout failed at IdP", // TODO: translate
	IDP_SLO_NOT_SUPPORTED: "IdP does not support Single Logout Service", // TODO: translate
	SAML_PROVIDER_NOT_FOUND: "SAML provider not found", // TODO: translate
	CERT_SOURCE_MISSING:
		"samlConfig requires either a signing certificate (cert or idpMetadata.cert) or an idpMetadata.metadata XML document.", // TODO: translate
};

const hiStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Unauthorized access", // TODO: translate
	INVALID_REQUEST_BODY: "Invalid request body", // TODO: translate
	SUBSCRIPTION_NOT_FOUND: "Subscription not found", // TODO: translate
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found", // TODO: translate
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan", // TODO: translate
	REFERENCE_ID_NOT_ALLOWED: "Reference id is not allowed", // TODO: translate
	CUSTOMER_NOT_FOUND: "Stripe customer not found for this user", // TODO: translate
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer", // TODO: translate
	UNABLE_TO_CREATE_BILLING_PORTAL: "Unable to create billing portal session", // TODO: translate
	STRIPE_SIGNATURE_NOT_FOUND: "Stripe signature not found", // TODO: translate
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found", // TODO: translate
	STRIPE_WEBHOOK_ERROR: "Stripe webhook error", // TODO: translate
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Failed to construct Stripe event", // TODO: translate
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans", // TODO: translate
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan", // TODO: translate
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active", // TODO: translate
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation", // TODO: translate
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Subscription has no pending cancellation or scheduled plan change", // TODO: translate
	ORGANIZATION_NOT_FOUND: "Organization not found", // TODO: translate
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Organization subscription is not enabled", // TODO: translate
	AUTHORIZE_REFERENCE_REQUIRED:
		"Organization subscriptions require authorizeReference callback to be configured", // TODO: translate
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Cannot delete organization with active subscription", // TODO: translate
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Reference ID is required. Provide referenceId or set activeOrganizationId in session", // TODO: translate
};

const hiTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> = {
	OTP_NOT_ENABLED: "OTP not enabled", // TODO: translate
	OTP_NOT_CONFIGURED: "OTP is not available", // TODO: translate
	OTP_HAS_EXPIRED: "OTP has expired", // TODO: translate
	TOTP_NOT_ENABLED: "TOTP not enabled", // TODO: translate
	TOTP_ALREADY_ENABLED: "TOTP is already enabled", // TODO: translate
	TOTP_NOT_CONFIGURED: "TOTP is not available", // TODO: translate
	TWO_FACTOR_NOT_ENABLED: "Two factor isn't enabled", // TODO: translate
	BACKUP_CODES_NOT_ENABLED: "Backup codes aren't enabled", // TODO: translate
	INVALID_BACKUP_CODE: "Invalid backup code", // TODO: translate
	INVALID_CODE: "Invalid code", // TODO: translate
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
		"Too many attempts. Please request a new code.", // TODO: translate
	ACCOUNT_TEMPORARILY_LOCKED:
		"Too many failed verification attempts. Your account is temporarily locked. Please try again later.", // TODO: translate
	INVALID_TWO_FACTOR_COOKIE: "Invalid two factor cookie", // TODO: translate
};

const hiUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Invalid username or password", // TODO: translate
	EMAIL_NOT_VERIFIED: "ईमेल सत्यापित नहीं है",
	UNEXPECTED_ERROR: "Unexpected error", // TODO: translate
	USERNAME_IS_ALREADY_TAKEN: "Username is already taken. Please try another.", // TODO: translate
	USERNAME_TOO_SHORT: "Username is too short", // TODO: translate
	USERNAME_TOO_LONG: "Username is too long", // TODO: translate
	INVALID_USERNAME: "Username is invalid", // TODO: translate
	INVALID_DISPLAY_USERNAME: "Display username is invalid", // TODO: translate
	USERNAME_IS_IMMUTABLE: "Username cannot be updated", // TODO: translate
};

/**
 * Hindi translations
 */
export const hi: CompleteTranslationDictionary = {
	...hiCore,
	...hiAdmin,
	...hiAnonymous,
	...hiApiKey,
	...hiCaptcha,
	...hiDeviceAuthorization,
	...hiElectron,
	...hiEmailOtp,
	...hiGenericOAuth,
	...hiHaveIBeenPwned,
	...hiMultiSession,
	...hiOauthPopup,
	...hiOrganization,
	...hiPasskey,
	...hiPhoneNumber,
	...hiSso,
	...hiStripe,
	...hiTwoFactor,
	...hiUsername,
};

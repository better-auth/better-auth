import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const DEVICE_AUTHORIZATION_ERROR_CODES = defineErrorCodes({
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
	RESOURCE_NOT_ALLOWED:
		"The requested resource is not in the list of allowed resources",
	RESOURCE_NOT_ABSOLUTE_URI: "The resource parameter must be an absolute URI",
	RESOURCE_HAS_FRAGMENT:
		"The resource parameter must not contain a fragment component",
	RESOURCE_NOT_AUTHORIZED:
		"A resource was requested at the token endpoint but none was authorized at the device authorization request",
	RESOURCE_EXCEEDS_GRANT:
		"The requested resource exceeds the resource authorized for this device code",
	JWT_PLUGIN_REQUIRED:
		"The jwt plugin is required to issue JWT access tokens for a requested resource",
});

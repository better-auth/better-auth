// This is a temporary plugin config file until we support actually using the plugin config files.

import * as z from "zod/v4";
import type { GetArgumentsOptions } from "../generate-auth";
import type { ImportGroup } from "../utility/imports";
import { createImport } from "../utility/imports";

export type Plugin = keyof typeof tempPluginsConfig;

export type PluginConfig = {
	displayName: string;
	auth: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	};
	authClient: {
		function: string;
		imports: ImportGroup[];
		arguments?: GetArgumentsOptions[];
	} | null;
};

export type PluginsConfig = {
	[key in Plugin]: PluginConfig;
};

export const tempPluginsConfig = {
	twoFactor: {
		displayName: "Two Factor",
		auth: {
			function: "twoFactor",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "twoFactor" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "two-factor-issuer",
					question: "What is the issuer for the two factor authentication?",
					description: "The issuer for the two factor authentication.",
					defaultValue: "My App",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "issuer",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "skip-verification-on-enable",
					question: "Skip verification on enable two factor authentication?",
					description: "Skip verification on enable two factor authentication.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "skipVerificationOnEnable",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "totp",
					description: "The number of digits for the TOTP code.",
					defaultValue: "My App",
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "totp-otp-digits",
							question: "What is the number of digits for the TOTP code?",
							description: "The number of digits for the TOTP code.",
							defaultValue: 6,
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "digits",
								schema: z.coerce.number().positive().optional(),
							},
						},
						{
							flag: "totp-otp-period",
							question: "What is the period for the TOTP code?",
							description: "The period for the TOTP code.",
							defaultValue: 30,
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "period",
								schema: z.coerce.number().positive().optional(),
							},
						},
					],
					argument: {
						index: 0,
						isProperty: "totp",
					},
				},
				{
					flag: "otp",
					description: "The options for the OTP code.",
					defaultValue: 3,
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "otp-period",
							question: "What is the period for the OTP code?",
							description: "The period for the OTP code.",
							defaultValue: 3,
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "period",
								schema: z.coerce.number().positive().optional(),
							},
						},
						{
							flag: "otp-store-otp",
							question: "How do you want to store the OTP code?",
							description: "The function to store the OTP code.",
							defaultValue: "storeOTP",
							skipPrompt: true,
							isSelectOptions: [
								{ value: "plain", label: "Plain text" },
								{ value: "encrypted", label: "Encrypted" },
								{ value: "hashed", label: "Hashed" },
							],
							argument: {
								index: 0,
								isProperty: "storeOTP",
								schema: z.enum(["plain", "encrypted", "hashed"]).optional(),
							},
						},
					],
					argument: {
						index: 0,
						isProperty: "otp",
					},
				},
				{
					flag: "backup-code",
					description: "The options for the backup code.",
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "backup-code-amount",
							question: "What is the amount of backup codes to generate?",
							description: "The amount of backup codes to generate.",
							defaultValue: 10,
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "amount",
								schema: z.coerce.number().positive().optional(),
							},
						},
						{
							flag: "backup-code-length",
							question: "What is the length of the backup codes?",
							description: "The length of the backup codes.",
							defaultValue: 10,
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "length",
								schema: z.coerce.number().positive().optional(),
							},
						},
					],
					argument: {
						index: 0,
						isProperty: "backupCodeOptions",
					},
				},
				{
					flag: "two-factor-schema",
					argument: {
						index: 0,
						isProperty: "schema",
					},
					description: "The schema for the two factor plugin.",
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "two-factor-table",
							question: "What is the name of the two factor table?",
							description: "The name of the two factor table.",
							defaultValue: "twoFactor",
							skipPrompt: true,
							argument: {
								index: 0,
								isProperty: "twoFactorTable",
								schema: z.coerce.string().optional(),
							},
						},
					],
				},
			],
		},
		authClient: {
			function: "twoFactorClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "twoFactorClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	username: {
		displayName: "Username",
		auth: {
			function: "username",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "username" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "username-max-username-length",
					question: "What is the maximum length of the username?",
					description: "The maximum length of the username.",
					isNumber: true,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "maxUsernameLength",
						schema: z.coerce.number().min(0).positive().optional(),
					},
				},
				{
					flag: "username-min-username-length",
					question: "What is the minimum length of the username?",
					description: "The minimum length of the username.",
					isNumber: true,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "minUsernameLength",
						schema: z.coerce.number().min(0).positive().optional(),
					},
				},
				{
					flag: "username-validation-order",
					description:
						"The order of validation for username and display username.",
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "username-validation-order-username",
							question: "When should username validation occur?",
							description: "The order of username validation.",
							defaultValue: "pre-normalization",
							skipPrompt: true,
							isSelectOptions: [
								{ value: "pre-normalization", label: "Pre-normalization" },
								{ value: "post-normalization", label: "Post-normalization" },
							],
							argument: {
								index: 0,
								isProperty: "username",
								schema: z
									.enum(["pre-normalization", "post-normalization"])
									.optional(),
							},
						},
						{
							flag: "username-validation-order-display-username",
							question: "When should display username validation occur?",
							description: "The order of display username validation.",
							defaultValue: "pre-normalization",
							skipPrompt: true,
							isSelectOptions: [
								{ value: "pre-normalization", label: "Pre-normalization" },
								{ value: "post-normalization", label: "Post-normalization" },
							],
							argument: {
								index: 0,
								isProperty: "displayUsername",
								schema: z
									.enum(["pre-normalization", "post-normalization"])
									.optional(),
							},
						},
					],
					argument: {
						index: 0,
						isProperty: "validationOrder",
					},
				},
			],
		},
		authClient: {
			function: "usernameClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "usernameClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	magicLink: {
		displayName: "Magic Link",
		auth: {
			function: "magicLink",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "magicLink" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "magic-link-expires-in",
					description:
						"Time in seconds until the magic link expires. Default is (60 * 5) 5 minutes",
					question:
						"[Magic Link] What is the expiration time for the magic link in seconds?",
					defaultValue: 300,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "expiresIn",
						schema: z.coerce.number().optional(),
					},
				},
				{
					flag: "magic-link-send-magic-link",
					description: "Send magic link implementation.",
					question: "[Magic Link] What is the send magic link?",
					defaultValue: `async ({ email, url, token }, request) => {
	 // Send magic link to the user
	}`,
					skipPrompt: true,
					isRequired: true,
					argument: {
						index: 0,
						isProperty: "sendMagicLink",
						schema: z.coerce.string(),
					},
				},
				{
					flag: "magic-link-rate-limit",
					description:
						"Rate limit configuration. Default window is 60 seconds and max is 5 requests.",
					skipPrompt: true,
					isNestedObject: [
						{
							flag: "magic-link-rate-limit-window",
							description: "Window in seconds. Default is 60 seconds.",
							question: "[Magic Link] What is the window in seconds?",
							defaultValue: 60,
							skipPrompt: true,
							isNumber: true,
							argument: {
								index: 0,
								isProperty: "window",
								schema: z.coerce.number().optional(),
							},
						},
						{
							flag: "magic-link-rate-limit-max",
							description: "Max requests. Default is 5 requests.",
							question: "[Magic Link] What is the max requests?",
							defaultValue: 5,
							skipPrompt: true,
							isNumber: true,
							argument: {
								index: 0,
								isProperty: "max",
								schema: z.coerce.number().optional(),
							},
						},
					],
					argument: {
						index: 0,
						isProperty: "rateLimit",
					},
				},
				{
					flag: "magic-link-store-token",
					description:
						"This option allows you to configure how the token is stored in your database. Note: This will not affect the token that's sent, it will only affect the token stored in your database.",
					question: "[Magic Link] How would you like to store the token?",
					defaultValue: "plain",
					skipPrompt: true,
					isSelectOptions: [
						{ value: "plain", label: "Plain" },
						{ value: "hashed", label: "Hashed" },
					],
					argument: {
						index: 0,
						isProperty: "storeToken",
						schema: z.enum(["plain", "hashed"]).optional(),
					},
				},
			],
		},
		authClient: {
			function: "magicLinkClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "magicLinkClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	emailOTP: {
		displayName: "Email OTP",
		auth: {
			function: "emailOTP",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "emailOTP" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "email-otp-send-verification-otp",
					description: "Function to send email verification",
					question: "[Email OTP] What is the send verification o t p?",
					defaultValue: `async ({ email, otp, type }, request) => {
 // Send email with OTP
}`,
					skipPrompt: true,
					isRequired: true,
					argument: {
						index: 0,
						isProperty: "sendVerificationOTP",
						schema: z.coerce.string(),
					},
				},
				{
					flag: "email-otp-otp-length",
					description: "Length of the OTP",
					question: "[Email OTP] What is the length of the OTP?",
					defaultValue: 6,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "otpLength",
						schema: z.coerce.number().optional(),
					},
				},
				{
					flag: "email-otp-expires-in",
					description: "Expiry time of the OTP in seconds default is 5 minutes",
					question:
						"[Email OTP] What is the expiry time of the OTP in seconds?",
					defaultValue: 300,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "expiresIn",
						schema: z.coerce.number().optional(),
					},
				},
				{
					flag: "email-otp-send-verification-on-sign-up",
					description: "Send email verification on sign-up",
					question: "[Email OTP] Would you like to send the OTP on sign-up?",
					defaultValue: false,
					skipPrompt: true,
					isConformation: true,
					argument: {
						index: 0,
						isProperty: "sendVerificationOnSignUp",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "email-otp-disable-sign-up",
					description:
						"A boolean value that determines whether to prevent automatic sign-up when the user is not registered.",
					question: "[Email OTP] Would you like to disable sign-up?",
					defaultValue: false,
					skipPrompt: true,
					isConformation: true,
					argument: {
						index: 0,
						isProperty: "disableSignUp",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "email-otp-allowed-attempts",
					description: "Allowed attempts for the OTP code",
					question:
						"[Email OTP] What is the allowed attempts for the OTP code?",
					defaultValue: 3,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "allowedAttempts",
						schema: z.coerce.number().optional(),
					},
				},
				{
					flag: "email-otp-store-otp",
					description:
						"Store the OTP in your database in a secure way Note: This will not affect the OTP sent to the user, it will only affect the OTP stored in your database",
					question: "[Email OTP] How would you like to store the OTP code?",
					defaultValue: "plain",
					skipPrompt: true,
					isSelectOptions: [
						{ value: "plain", label: "Plain" },
						{ value: "encrypted", label: "Encrypted" },
						{ value: "hashed", label: "Hashed" },
					],
					argument: {
						index: 0,
						isProperty: "storeOTP",
						schema: z.enum(["plain", "encrypted", "hashed"]).optional(),
					},
				},
				{
					flag: "email-otp-override-default-email-verification",
					description:
						"Override the default email verification to use email otp instead",
					question:
						"[Email OTP] Would you like to override the default email verification?",
					defaultValue: false,
					skipPrompt: true,
					isConformation: true,
					argument: {
						index: 0,
						isProperty: "overrideDefaultEmailVerification",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "emailOTPClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "emailOTPClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	genericOAuth: {
		displayName: "Generic OAuth",
		auth: {
			function: "genericOAuth",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "genericOAuth" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "genericOAuthClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "genericOAuthClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	anonymous: {
		displayName: "Anonymous",
		auth: {
			function: "anonymous",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "anonymous" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "anonymousClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "anonymousClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	phoneNumber: {
		displayName: "Phone Number",
		auth: {
			function: "phoneNumber",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "phoneNumber" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "phoneNumberClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "phoneNumberClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	passkey: {
		displayName: "Passkey",
		auth: {
			function: "passkey",
			imports: [
				{
					path: "better-auth/plugins/passkey",
					imports: [createImport({ name: "passkey" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "passkeyClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "passkeyClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	oidc: {
		displayName: "OIDC",
		auth: {
			function: "oidc",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "oidc" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "oidcClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "oidcClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	admin: {
		displayName: "Admin",
		auth: {
			function: "admin",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "admin" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "admin-default-role",
					question: "What is the default role for new users?",
					description: "The default role assigned to new users.",
					defaultValue: "user",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "defaultRole",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "admin-roles",
					question: "What are the admin roles?",
					description: "Array of roles that are considered admin roles.",
					defaultValue: ["admin"],
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "adminRoles",
						schema: z.array(z.string()).optional(),
					},
				},
			],
		},
		authClient: {
			function: "adminClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "adminClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	apiKey: {
		displayName: "API Key",
		auth: {
			function: "apiKey",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "apiKey" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "api-key-headers",
					question: "What header name should be used for API keys?",
					description: "The header name to check for API key.",
					defaultValue: "x-api-key",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "apiKeyHeaders",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "api-key-length",
					question: "What is the default length of API keys?",
					description: "The length of the API key. Longer is better.",
					defaultValue: 64,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "defaultKeyLength",
						schema: z.coerce.number().positive().optional(),
					},
				},
				{
					flag: "api-key-disable-hashing",
					question: "Disable hashing of API keys?",
					description:
						"Disable hashing of the API key. Not recommended for security.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "disableKeyHashing",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "api-key-enable-metadata",
					question: "Enable metadata for API keys?",
					description: "Whether to enable metadata for an API key.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "enableMetadata",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "api-key-enable-session",
					question: "Enable session for API keys?",
					description: "An API Key can represent a valid session.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "enableSessionForAPIKeys",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "apiKeyClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "apiKeyClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	bearer: {
		displayName: "Bearer",
		auth: {
			function: "bearer",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "bearer" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "bearer-require-signature",
					question: "Require signature for bearer tokens?",
					description:
						"If true, only signed tokens will be converted to session cookies.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "requireSignature",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: null,
	},
	captcha: {
		displayName: "CAPTCHA",
		auth: {
			function: "captcha",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "captcha" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "captcha-provider",
					question: "Which CAPTCHA provider do you want to use?",
					description: "The CAPTCHA provider to use.",
					isSelectOptions: [
						{ value: "google-recaptcha", label: "Google reCAPTCHA" },
						{ value: "cloudflare-turnstile", label: "Cloudflare Turnstile" },
						{ value: "hcaptcha", label: "hCaptcha" },
						{ value: "captchafox", label: "CaptchaFox" },
					],
					argument: {
						index: 0,
						isProperty: "provider",
						schema: z.enum([
							"google-recaptcha",
							"cloudflare-turnstile",
							"hcaptcha",
							"captchafox",
						]),
					},
				},
				{
					flag: "captcha-secret-key",
					question: "What is your CAPTCHA secret key?",
					description: "The secret key for the CAPTCHA provider.",
					argument: {
						index: 0,
						isProperty: "secretKey",
						schema: z.coerce.string(),
					},
				},
				{
					flag: "captcha-site-key",
					question: "What is your CAPTCHA site key?",
					description:
						"The site key for the CAPTCHA provider (required for hCaptcha and CaptchaFox).",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "siteKey",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "captcha-min-score",
					question: "What is the minimum score for Google reCAPTCHA?",
					description: "The minimum score for Google reCAPTCHA v3 (0-1).",
					defaultValue: 0.5,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "minScore",
						schema: z.coerce.number().min(0).max(1).optional(),
					},
				},
			],
		},
		authClient: null,
	},
	customSession: {
		displayName: "Custom Session",
		auth: {
			function: "customSession",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "customSession" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "custom-session-mutate-list-device-sessions",
					question: "Should the list-device-sessions endpoint be mutated?",
					description:
						"Determine if the list-device-sessions endpoint should be mutated to the custom session data.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "shouldMutateListDeviceSessionsEndpoint",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "customSessionClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "customSessionClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	deviceAuthorization: {
		displayName: "Device Authorization",
		auth: {
			function: "deviceAuthorization",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "deviceAuthorization" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "device-auth-expires-in",
					question: "When should device codes expire?",
					description:
						"Time until the device code expires. Use formats like '30m', '5s', '1h'.",
					defaultValue: "30m",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "expiresIn",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "device-auth-interval",
					question: "What is the polling interval?",
					description:
						"Time between polling attempts. Use formats like '30m', '5s', '1h'.",
					defaultValue: "5s",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "interval",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "device-auth-device-code-length",
					question: "What is the length of the device code?",
					description: "Length of the device code to be generated.",
					defaultValue: 40,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "deviceCodeLength",
						schema: z.coerce.number().positive().optional(),
					},
				},
				{
					flag: "device-auth-user-code-length",
					question: "What is the length of the user code?",
					description: "Length of the user code to be generated.",
					defaultValue: 8,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "userCodeLength",
						schema: z.coerce.number().positive().optional(),
					},
				},
			],
		},
		authClient: {
			function: "deviceAuthorizationClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "deviceAuthorizationClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	haveIBeenPwned: {
		displayName: "Have I Been Pwned",
		auth: {
			function: "haveIBeenPwned",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "haveIBeenPwned" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "haveibeenpwned-custom-message",
					question: "What is the custom message for compromised passwords?",
					description:
						"Custom message to display when a password is compromised.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "customPasswordCompromisedMessage",
						schema: z.coerce.string().optional(),
					},
				},
			],
		},
		authClient: null,
	},
	jwt: {
		displayName: "JWT",
		auth: {
			function: "jwt",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "jwt" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "jwt-disable-setting-jwt-header",
					question: "Disable setting JWT header?",
					description: "If true, the JWT header will not be set in responses.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "disableSettingJwtHeader",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "jwtClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "jwtClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	lastLoginMethod: {
		displayName: "Last Login Method",
		auth: {
			function: "lastLoginMethod",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "lastLoginMethod" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "last-login-method-cookie-name",
					question: "What is the cookie name for last login method?",
					description: "Name of the cookie to store the last login method.",
					defaultValue: "better-auth.last_used_login_method",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "cookieName",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "last-login-method-max-age",
					question: "What is the cookie expiration time in seconds?",
					description: "Cookie expiration time in seconds.",
					defaultValue: 2592000,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "maxAge",
						schema: z.coerce.number().positive().optional(),
					},
				},
				{
					flag: "last-login-method-store-in-database",
					question: "Store the last login method in the database?",
					description:
						"Store the last login method in the database. This will create a new field in the user table.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "storeInDatabase",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "lastLoginMethodClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "lastLoginMethodClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	mcp: {
		displayName: "MCP",
		auth: {
			function: "mcp",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "mcp" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "mcp-login-page",
					question: "What is the login page URL?",
					description: "The login page URL for MCP.",
					argument: {
						index: 0,
						isProperty: "loginPage",
						schema: z.coerce.string(),
					},
				},
				{
					flag: "mcp-resource",
					question: "What is the resource URL?",
					description: "The resource URL for MCP.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "resource",
						schema: z.coerce.string().optional(),
					},
				},
			],
		},
		authClient: null,
	},
	multiSession: {
		displayName: "Multi Session",
		auth: {
			function: "multiSession",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "multiSession" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "multi-session-maximum-sessions",
					question: "What is the maximum number of sessions a user can have?",
					description:
						"The maximum number of sessions a user can have at a time.",
					defaultValue: 5,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "maximumSessions",
						schema: z.coerce.number().positive().optional(),
					},
				},
			],
		},
		authClient: {
			function: "multiSessionClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "multiSessionClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	oauthProxy: {
		displayName: "OAuth Proxy",
		auth: {
			function: "oAuthProxy",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "oAuthProxy" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "oauth-proxy-current-url",
					question: "What is the current URL of the application?",
					description:
						"The current URL of the application. The plugin will attempt to infer this from your environment.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "currentURL",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "oauth-proxy-production-url",
					question: "What is the production URL?",
					description:
						"If a request is in a production URL it won't be proxied.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "productionURL",
						schema: z.coerce.string().optional(),
					},
				},
			],
		},
		authClient: null,
	},
	oneTap: {
		displayName: "One Tap",
		auth: {
			function: "oneTap",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "oneTap" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "one-tap-disable-signup",
					question: "Disable the signup flow?",
					description: "Disable the signup flow.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "disableSignup",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "one-tap-client-id",
					question: "What is your Google Client ID?",
					description:
						"Google Client ID. If a client ID is provided in the social provider configuration, it will be used.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "clientId",
						schema: z.coerce.string().optional(),
					},
				},
			],
		},
		authClient: {
			function: "oneTapClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "oneTapClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	oneTimeToken: {
		displayName: "One Time Token",
		auth: {
			function: "oneTimeToken",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "oneTimeToken" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "one-time-token-expires-in",
					question: "When should tokens expire (in minutes)?",
					description: "Expires in minutes.",
					defaultValue: 3,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "expiresIn",
						schema: z.coerce.number().positive().optional(),
					},
				},
				{
					flag: "one-time-token-disable-client-request",
					question: "Disable client requests?",
					description: "Only allow server initiated requests.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "disableClientRequest",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "one-time-token-store-token",
					question: "How should tokens be stored?",
					description: "Configure how the token is stored in your database.",
					defaultValue: "plain",
					skipPrompt: true,
					isSelectOptions: [
						{ value: "plain", label: "Plain text" },
						{ value: "hashed", label: "Hashed" },
					],
					argument: {
						index: 0,
						isProperty: "storeToken",
						schema: z.enum(["plain", "hashed"]).optional(),
					},
				},
			],
		},
		authClient: {
			function: "oneTimeTokenClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "oneTimeTokenClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	openAPI: {
		displayName: "Open API",
		auth: {
			function: "openAPI",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "openAPI" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "open-api-path",
					question: "What is the path to the OpenAPI reference page?",
					description:
						"The path to the OpenAPI reference page. This will be appended to the base URL `/api/auth` path.",
					defaultValue: "/reference",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "path",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "open-api-disable-default-reference",
					question: "Disable the default reference page?",
					description:
						"Disable the default reference page that is generated by Scalar.",
					defaultValue: false,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "disableDefaultReference",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "open-api-theme",
					question: "What theme should be used for the OpenAPI reference page?",
					description: "Theme of the OpenAPI reference page.",
					defaultValue: "default",
					skipPrompt: true,
					isSelectOptions: [
						{ value: "alternate", label: "Alternate" },
						{ value: "default", label: "Default" },
						{ value: "moon", label: "Moon" },
						{ value: "purple", label: "Purple" },
						{ value: "solarized", label: "Solarized" },
						{ value: "bluePlanet", label: "Blue Planet" },
						{ value: "saturn", label: "Saturn" },
						{ value: "kepler", label: "Kepler" },
						{ value: "mars", label: "Mars" },
						{ value: "deepSpace", label: "Deep Space" },
						{ value: "laserwave", label: "Laserwave" },
						{ value: "none", label: "None" },
					],
					argument: {
						index: 0,
						isProperty: "theme",
						schema: z
							.enum([
								"alternate",
								"default",
								"moon",
								"purple",
								"solarized",
								"bluePlanet",
								"saturn",
								"kepler",
								"mars",
								"deepSpace",
								"laserwave",
								"none",
							])
							.optional(),
					},
				},
			],
		},
		authClient: null,
	},
	organization: {
		displayName: "Organization",
		auth: {
			function: "organization",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "organization" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "organization-allow-user-to-create",
					question: "Allow users to create organizations?",
					description:
						"Configure whether new users are able to create new organizations.",
					defaultValue: true,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "allowUserToCreateOrganization",
						schema: z.coerce.boolean().optional(),
					},
				},
				{
					flag: "organization-creator-role",
					question: "What role should be assigned to the creator?",
					description:
						"The role that is assigned to the creator of the organization.",
					defaultValue: "owner",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "creatorRole",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "organization-membership-limit",
					question: "What is the maximum number of members allowed?",
					description:
						"The maximum number of members allowed in an organization.",
					defaultValue: 100,
					skipPrompt: true,
					isNumber: true,
					argument: {
						index: 0,
						isProperty: "membershipLimit",
						schema: z.coerce.number().positive().optional(),
					},
				},
			],
		},
		authClient: {
			function: "organizationClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "organizationClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	siwe: {
		displayName: "SIWE",
		auth: {
			function: "siwe",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "siwe" })],
					isNamedImport: false,
				},
			],
			arguments: [
				{
					flag: "siwe-domain",
					question: "What is the domain for SIWE?",
					description: "The domain for SIWE.",
					argument: {
						index: 0,
						isProperty: "domain",
						schema: z.coerce.string(),
					},
				},
				{
					flag: "siwe-email-domain-name",
					question: "What is the email domain name?",
					description: "The email domain name for anonymous users.",
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "emailDomainName",
						schema: z.coerce.string().optional(),
					},
				},
				{
					flag: "siwe-anonymous",
					question: "Allow anonymous users?",
					description: "Allow anonymous users.",
					defaultValue: true,
					skipPrompt: true,
					argument: {
						index: 0,
						isProperty: "anonymous",
						schema: z.coerce.boolean().optional(),
					},
				},
			],
		},
		authClient: {
			function: "siweClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "siweClient" })],
					isNamedImport: false,
				},
			],
		},
	},
} as const satisfies Record<string, PluginConfig>;

import * as z from "zod/v4";
import type { GetArgumentsOptions } from "../generate-auth";
import { createImport, type ImportGroup } from "../utility/imports";

export type Plugin = keyof typeof pluginsConfig;

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

export const pluginsConfig = {
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
					flag: "max-username-length",
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
					flag: "min-username-length",
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
} as const satisfies Record<string, PluginConfig>;

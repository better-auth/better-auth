import type { BetterAuthPlugin } from "@better-auth/core";
import * as z from "zod";
import { mergeSchema } from "../../db";
import type { User } from "../../types";
import type { InferOptionSchema } from "../../types/plugins";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { PACKAGE_VERSION } from "../../version";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";
import {
	deviceApprove,
	deviceCode,
	deviceDeny,
	deviceToken,
	deviceVerify,
} from "./routes";
import { schema } from "./schema";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"device-authorization": {
			creator: typeof deviceAuthorization;
		};
	}
}

const timeStringSchema = z.custom<TimeString>(
	(val) => {
		if (typeof val !== "string") return false;
		try {
			ms(val as TimeString);
			return true;
		} catch {
			return false;
		}
	},
	{
		message:
			"Invalid time string format. Use formats like '30m', '5s', '1h', etc.",
	},
);

export const deviceAuthorizationOptionsSchema = z.object({
	expiresIn: timeStringSchema
		.default("30m")
		.describe(
			"Time in seconds until the device code expires. Use formats like '30m', '5s', '1h', etc.",
		),
	interval: timeStringSchema
		.default("5s")
		.describe(
			"Time in seconds between polling attempts. Use formats like '30m', '5s', '1h', etc.",
		),
	deviceCodeLength: z
		.number()
		.int()
		.positive()
		.default(40)
		.describe(
			"Length of the device code to be generated. Default is 40 characters.",
		),
	userCodeLength: z
		.number()
		.int()
		.positive()
		.default(8)
		.describe(
			"Length of the user code to be generated. Default is 8 characters.",
		),
	generateDeviceCode: z
		.custom<() => string | Promise<string>>(
			(val) => typeof val === "function",
			{
				message:
					"generateDeviceCode must be a function that returns a string or a promise that resolves to a string.",
			},
		)
		.optional()
		.describe(
			"Function to generate a device code. If not provided, a default random string generator will be used.",
		),
	generateUserCode: z
		.custom<() => string | Promise<string>>(
			(val) => typeof val === "function",
			{
				message:
					"generateUserCode must be a function that returns a string or a promise that resolves to a string.",
			},
		)
		.optional()
		.describe(
			"Function to generate a user code. If not provided, a default random string generator will be used.",
		),
	validateClient: z
		.custom<(clientId: string) => boolean | Promise<boolean>>(
			(val) => typeof val === "function",
			{
				message:
					"validateClient must be a function that returns a boolean or a promise that resolves to a boolean.",
			},
		)
		.optional()
		.describe(
			"Function to validate the client ID. If not provided, no validation will be performed.",
		),
	onDeviceAuthRequest: z
		.custom<
			(
				clientId: string,
				scope: string | undefined,
				resource?: string | string[] | undefined,
			) => void | Promise<void>
		>((val) => typeof val === "function", {
			message:
				"onDeviceAuthRequest must be a function that returns void or a promise that resolves to void.",
		})
		.optional()
		.describe(
			"Function to handle device authorization requests. If not provided, no additional actions will be taken.",
		),
	allowedResources: z
		.array(
			z.string().refine(
				(value) => {
					// RFC 8707 §2: an absolute URI with no fragment. Validated at
					// config-parse time so a misconfigured allow-list fails fast at
					// `betterAuth()` init rather than silently at request time.
					let url: URL;
					try {
						url = new URL(value);
					} catch {
						return false;
					}
					// A bare trailing `#` yields url.hash === "" but is still a
					// fragment component (RFC 3986), so also check the raw string.
					return url.hash === "" && !value.includes("#");
				},
				{
					message:
						"allowedResources entries must be absolute URIs without a fragment (RFC 8707 §2).",
				},
			),
		)
		.optional()
		.describe(
			"Allow-list of RFC 8707 resource indicator URIs clients may request. A resource outside this list is rejected with `invalid_target`. When unset/empty, any `resource` request is rejected. Each entry must be an absolute URI without a fragment.",
		),
	customAccessTokenClaims: z
		.custom<
			(params: {
				user: User;
				scopes: string[];
				resource: string | string[];
				clientId: string;
			}) => Record<string, unknown> | Promise<Record<string, unknown>>
		>((val) => typeof val === "function", {
			message: "customAccessTokenClaims must be a function.",
		})
		.optional()
		.describe("Hook to add custom claims to the issued JWT access token."),
	verificationUri: z
		.string()
		.optional()
		.describe(
			"The URI where users verify their device code. Can be an absolute URL (https://example.com/device) or relative path (/custom-path). This will be returned as verification_uri in the device code response. If not provided, defaults to /device.",
		),
	schema: z.custom<InferOptionSchema<typeof schema>>(() => true).optional(),
});

export type DeviceAuthorizationOptions = z.infer<
	typeof deviceAuthorizationOptionsSchema
>;

export const deviceAuthorization = (
	options: Partial<DeviceAuthorizationOptions> = {},
) => {
	const opts = deviceAuthorizationOptionsSchema.parse(options);

	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		schema: mergeSchema(schema, options?.schema),
		endpoints: {
			deviceCode: deviceCode(opts),
			deviceToken: deviceToken(opts),
			deviceVerify,
			deviceApprove,
			deviceDeny,
		},
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "../../utils/time";

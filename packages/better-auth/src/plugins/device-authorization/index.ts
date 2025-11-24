import type { BetterAuthPlugin } from "@better-auth/core";
import type { StringValue as MSStringValue } from "ms";
import { ms } from "ms";
import * as z from "zod";
import { mergeSchema } from "../../db";
import type { InferOptionSchema } from "../../types/plugins";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";
import {
	deviceApprove,
	deviceCode,
	deviceDeny,
	deviceToken,
	deviceVerify,
} from "./routes";
import { schema } from "./schema";

const msStringValueSchema = z.custom<MSStringValue>(
	(val) => {
		try {
			ms(val as MSStringValue);
		} catch (e) {
			return false;
		}
		return true;
	},
	{
		message:
			"Invalid time string format. Use formats like '30m', '5s', '1h', etc.",
	},
);

export const deviceAuthorizationOptionsSchema = z.object({
	expiresIn: msStringValueSchema
		.default("30m")
		.describe(
			"Time in seconds until the device code expires. Use formats like '30m', '5s', '1h', etc.",
		),
	interval: msStringValueSchema
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
			(clientId: string, scope: string | undefined) => void | Promise<void>
		>((val) => typeof val === "function", {
			message:
				"onDeviceAuthRequest must be a function that returns void or a promise that resolves to void.",
		})
		.optional()
		.describe(
			"Function to handle device authorization requests. If not provided, no additional actions will be taken.",
		),
	verificationUri: z
		.string()
		.optional()
		.describe(
			"The URI where users verify their device code. Can be an absolute URL (https://example.com/device) or relative path (/custom-path). This will be returned as verification_uri in the device code response. If not provided, defaults to /device.",
		),
	schema: z.custom<InferOptionSchema<typeof schema>>(() => true),
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
		schema: mergeSchema(schema, options?.schema),
		endpoints: {
			deviceCode: deviceCode(opts),
			deviceToken: deviceToken(opts),
			deviceVerify,
			deviceApprove,
			deviceDeny,
		},
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

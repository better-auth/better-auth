import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	StandardSchemaV1,
} from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { BetterAuthError } from "@better-auth/core/error";
import * as z from "zod";
import { mergeSchema } from "../../db";
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
import { DEVICE_AUTHORIZATION_CODE_MAX_LENGTH, schema } from "./schema";

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
		.max(DEVICE_AUTHORIZATION_CODE_MAX_LENGTH)
		.default(40)
		.describe(
			`Length of the device code to be generated. Must be at most ${DEVICE_AUTHORIZATION_CODE_MAX_LENGTH} characters. Default is 40 characters.`,
		),
	userCodeLength: z
		.number()
		.int()
		.positive()
		.max(DEVICE_AUTHORIZATION_CODE_MAX_LENGTH)
		.default(8)
		.describe(
			`Length of the user code to be generated. Must be at most ${DEVICE_AUTHORIZATION_CODE_MAX_LENGTH} characters. Default is 8 characters.`,
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
	schema: z.custom<InferOptionSchema<typeof schema>>(() => true).optional(),
});

export type DeviceAuthorizationOptions = z.infer<
	typeof deviceAuthorizationOptionsSchema
>;

export interface DeviceAuthorizationRequest {
	client_id?: string | undefined;
	user_id?: string | undefined;
	scope?: string | undefined;
}

/** The client binding and grant-owned fields produced by request authorization. */
export interface DeviceAuthorizationGrantAuthorization {
	/** The client identifier that owns the device code. */
	clientId: string;
	/** Additional grant-owned fields persisted with the device code. */
	deviceCodeFields: Record<string, unknown>;
}

/**
 * A token grant that contributes its request state to device authorization
 * without expanding the standalone plugin's database or endpoint contracts.
 */
export interface DeviceAuthorizationGrant<
	RequestFields extends z.ZodRawShape = z.ZodRawShape,
	VerificationContext extends Record<string, unknown> = Record<string, unknown>,
> {
	/** Additional request fields accepted only when this grant is configured. */
	requestSchemaFields: RequestFields;
	/** Additional request errors introduced by the grant's protocol extensions. */
	requestErrorCodes?: readonly string[];
	/** Additional OpenAPI responses introduced by the grant's request protocol. */
	requestOpenAPIResponses?: Record<string, Record<string, unknown>>;
	/** Translate validation issues raised by the grant's request fields. */
	onRequestValidationError?: (
		issues: readonly StandardSchemaV1.Issue[],
	) => void;
	/** Database fields persisted only when this grant is configured. */
	deviceCodeSchemaFields: Record<string, DBFieldAttribute>;
	/** Validate a request and return its client binding and fields to persist. */
	authorizeRequest: (input: {
		ctx: GenericEndpointContext;
		request: DeviceAuthorizationRequest & z.infer<z.ZodObject<RequestFields>>;
	}) =>
		| DeviceAuthorizationGrantAuthorization
		| undefined
		| Promise<DeviceAuthorizationGrantAuthorization | undefined>;
	/** Refuse the standalone session-token endpoint for grant-owned codes. */
	assertSessionRedemption: (input: {
		ctx: GenericEndpointContext;
		deviceCode: Record<string, unknown>;
	}) => void | Promise<void>;
	/** Add grant-owned information to the owner-only verification response. */
	getVerificationContext: (
		deviceCode: Record<string, unknown>,
	) => VerificationContext | undefined;
	/** OpenAPI properties matching `getVerificationContext()`. */
	verificationOpenAPIProperties?: Record<string, Record<string, unknown>>;
}

export type DeviceAuthorizationPluginOptions<
	Grant extends DeviceAuthorizationGrant | undefined = undefined,
> = Partial<DeviceAuthorizationOptions> & {
	/** Optional token grant that extends the device authorization flow. */
	grant?: Grant;
};

const deviceAuthorizationRequestFields = new Set([
	"client_id",
	"user_id",
	"scope",
]);
const deviceVerificationResponseFields = new Set([
	"user_code",
	"status",
	"client_id",
	"scope",
]);

function assertGrantFieldsAreAdditional(
	grant: DeviceAuthorizationGrant | undefined,
) {
	const conflictingDeviceCodeFields = Object.keys(
		grant?.deviceCodeSchemaFields ?? {},
	).filter((field) => field in schema.deviceCode.fields);
	if (conflictingDeviceCodeFields.length > 0) {
		throw new BetterAuthError(
			`Device authorization grant fields must be additional and cannot redefine deviceCode fields: ${conflictingDeviceCodeFields.join(", ")}`,
		);
	}

	const conflictingRequestFields = Object.keys(
		grant?.requestSchemaFields ?? {},
	).filter((field) => deviceAuthorizationRequestFields.has(field));
	if (conflictingRequestFields.length > 0) {
		throw new BetterAuthError(
			`Device authorization grant request fields must be additional and cannot redefine request fields: ${conflictingRequestFields.join(", ")}`,
		);
	}

	const conflictingVerificationFields = Object.keys(
		grant?.verificationOpenAPIProperties ?? {},
	).filter((field) => deviceVerificationResponseFields.has(field));
	if (conflictingVerificationFields.length > 0) {
		throw new BetterAuthError(
			`Device authorization grant verification fields must be additional and cannot redefine response fields: ${conflictingVerificationFields.join(", ")}`,
		);
	}
}

export const deviceAuthorization = <
	Grant extends DeviceAuthorizationGrant | undefined = undefined,
>(
	options: DeviceAuthorizationPluginOptions<Grant> = {},
) => {
	const { grant: configuredGrant, ...deviceAuthorizationOptions } = options;
	const grant = configuredGrant as Grant;
	const opts = deviceAuthorizationOptionsSchema.parse(
		deviceAuthorizationOptions,
	);
	assertGrantFieldsAreAdditional(grant);
	const grantSchema = {
		deviceCode: {
			...schema.deviceCode,
			fields: {
				...schema.deviceCode.fields,
				...grant?.deviceCodeSchemaFields,
			},
		},
	};

	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		schema: mergeSchema(grantSchema, options.schema),
		endpoints: {
			deviceCode: deviceCode(opts, grant),
			deviceToken: deviceToken(opts, grant),
			deviceVerify: deviceVerify(grant),
			deviceApprove,
			deviceDeny,
		},
		rateLimit: [
			{
				pathMatcher(path) {
					return path === "/device";
				},
				window: ms(opts.expiresIn) / 1000,
				max: 5,
			},
		],
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
		options: { ...opts, grant },
	} satisfies BetterAuthPlugin;
};

export type * from "../../utils/time";
export {
	type DeviceCodeRedemptionAuthorization,
	type DeviceCodeRedemptionResult,
	redeemDeviceCode,
} from "./routes";
export type { DeviceCode } from "./schema";

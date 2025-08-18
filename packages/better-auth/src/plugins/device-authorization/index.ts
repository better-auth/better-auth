import { z } from "zod/v4";
import { APIError } from "better-call";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { generateRandomString } from "../../crypto";
import type { AuthPluginSchema } from "../../types/plugins";
import type { FieldAttribute } from "../../db/field";
import { getSessionFromCtx } from "../../api/routes/session";
import { ms, type StringValue as MSStringValue } from "../../utils/time/ms";
import { getRandomValues } from "@better-auth/utils";

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

export const $deviceAuthorizationOptionsSchema = z.object({
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
});

/**
 * @see {$deviceAuthorizationOptionsSchema}
 */
export type DeviceAuthorizationOptions = z.infer<
	typeof $deviceAuthorizationOptionsSchema
>;

const deviceCodeSchema: AuthPluginSchema = {
	deviceCode: {
		fields: {
			deviceCode: {
				type: "string",
				required: true,
			},
			userCode: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				required: false,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
			status: {
				type: "string",
				required: true,
				defaultValue: "pending",
			},
			lastPolledAt: {
				type: "date",
				required: false,
			},
			pollingInterval: {
				type: "number",
				required: false,
			},
			clientId: {
				type: "string",
				required: false,
			},
			scope: {
				type: "string",
				required: false,
			},
		} satisfies Record<string, FieldAttribute>,
	},
};

export { deviceAuthorizationClient } from "./client";

const DEVICE_AUTHORIZATION_ERROR_CODES = {
	INVALID_DEVICE_CODE: "Invalid device code",
	EXPIRED_DEVICE_CODE: "Device code has expired",
	EXPIRED_USER_CODE: "User code has expired",
	AUTHORIZATION_PENDING: "Authorization pending",
	ACCESS_DENIED: "Access denied",
	INVALID_USER_CODE: "Invalid user code",
	DEVICE_CODE_ALREADY_PROCESSED: "Device code already processed",
	POLLING_TOO_FREQUENTLY: "Polling too frequently",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
	INVALID_DEVICE_CODE_STATUS: "Invalid device code status",
	AUTHENTICATION_REQUIRED: "Authentication required",
} as const;

const defaultCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * @internal
 */
const defaultGenerateDeviceCode = () => {
	return generateRandomString(40, "a-z", "A-Z", "0-9");
};

/**
 * @internal
 */
const defaultGenerateUserCode = (length: number) => {
	const chars = new Uint8Array(length);
	return Array.from(getRandomValues(chars))
		.map((byte) => defaultCharset[byte % defaultCharset.length])
		.join("");
};

export const deviceAuthorization = (
	options: Partial<DeviceAuthorizationOptions> = {},
) => {
	const opts = $deviceAuthorizationOptionsSchema.parse(
		options,
	) as Required<DeviceAuthorizationOptions>;
	const generateDeviceCode = async () => {
		if (opts.generateDeviceCode) {
			return opts.generateDeviceCode();
		}
		return defaultGenerateDeviceCode();
	};

	const generateUserCode = async () => {
		if (opts.generateUserCode) {
			return opts.generateUserCode();
		}
		return defaultGenerateUserCode(opts.userCodeLength);
	};

	return {
		id: "device-authorization",
		schema: deviceCodeSchema,
		endpoints: {
			deviceCode: createAuthEndpoint(
				"/device/code",
				{
					method: "POST",
					body: z.object({
						client_id: z.string().meta({
							description: "The client ID of the application",
						}),
						scope: z
							.string()
							.meta({
								description: "Space-separated list of scopes",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							description: `Request a device and user code

Follow [rfc8628#section-3.2](https://datatracker.ietf.org/doc/html/rfc8628#section-3.2)
`,
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													device_code: {
														type: "string",
														description: "The device verification code",
													},
													user_code: {
														type: "string",
														description: "The user code to display",
													},
													verification_uri: {
														type: "string",
														description: "The URL for user verification",
													},
													verification_uri_complete: {
														type: "string",
														description: "The complete URL with user code",
													},
													expires_in: {
														type: "number",
														description:
															"Lifetime in seconds of the device code",
													},
													interval: {
														type: "number",
														description: "Minimum polling interval in seconds",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const deviceCode = await generateDeviceCode();
					const userCode = await generateUserCode();
					const expiresIn = ms(opts.expiresIn || opts.expiresIn);
					const expiresAt = new Date(Date.now() + expiresIn);

					await ctx.context.adapter.create({
						model: "deviceCode",
						data: {
							deviceCode,
							userCode,
							expiresAt,
							status: "pending",
							pollingInterval: opts.interval,
							clientId: ctx.body.client_id,
							scope: ctx.body.scope,
						},
					});

					const baseURL = new URL(ctx.context.baseURL);
					const verification_uri = new URL("/device", baseURL);

					const verification_uri_complete = new URL(verification_uri);
					verification_uri_complete.searchParams.set(
						"user_code",
						// should we support encodeURIComponent or custom formatting function here?
						userCode,
					);

					return ctx.json(
						{
							device_code: deviceCode,
							user_code: userCode,
							verification_uri: verification_uri.toString(),
							verification_uri_complete: verification_uri_complete.toString(),
							expires_in: opts.expiresIn,
							interval: opts.interval,
						},
						{
							headers: {
								"Cache-Control": "no-store",
							},
						},
					);
				},
			),
			deviceToken: createAuthEndpoint(
				"/device/token",
				{
					method: "POST",
					body: z.object({
						grant_type: z
							.literal("urn:ietf:params:oauth:grant-type:device_code")
							.meta({
								description: "The grant type for device flow",
							}),
						device_code: z.string().meta({
							description: "The device verification code",
						}),
						client_id: z.string().meta({
							description: "The client ID of the application",
						}),
					}),
					metadata: {
						openapi: {
							description: "Exchange device code for access token",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													session: {
														$ref: "#/components/schemas/Session",
													},
													user: {
														$ref: "#/components/schemas/User",
													},
												},
											},
										},
									},
								},
								400: {
									description: "Error response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: {
														type: "string",
														enum: [
															"authorization_pending",
															"slow_down",
															"expired_token",
															"access_denied",
														],
													},
													errorDescription: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { device_code } = ctx.body;

					const deviceCodeRecord = await ctx.context.adapter.findOne<{
						id: string;
						deviceCode: string;
						userCode: string;
						userId?: string;
						expiresAt: Date;
						status: string;
						lastPolledAt?: Date;
						pollingInterval?: number;
						clientId?: string;
						scope?: string;
					}>({
						model: "deviceCode",
						where: [
							{
								field: "deviceCode",
								value: device_code,
							},
						],
					});

					if (!deviceCodeRecord) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE,
							details: {
								error: "invalid_grant",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE,
							},
						});
					}

					// Update last polled time
					await ctx.context.adapter.update({
						model: "deviceCode",
						where: [
							{
								field: "id",
								value: deviceCodeRecord.id,
							},
						],
						update: {
							lastPolledAt: new Date(),
						},
					});

					if (deviceCodeRecord.expiresAt < new Date()) {
						await ctx.context.adapter.delete({
							model: "deviceCode",
							where: [
								{
									field: "id",
									value: deviceCodeRecord.id,
								},
							],
						});
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_DEVICE_CODE,
							details: {
								error: "expired_token",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_DEVICE_CODE,
							},
						});
					}

					if (deviceCodeRecord.status === "pending") {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.AUTHORIZATION_PENDING,
							details: {
								error: "authorization_pending",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.AUTHORIZATION_PENDING,
							},
						});
					}

					if (deviceCodeRecord.status === "denied") {
						await ctx.context.adapter.delete({
							model: "deviceCode",
							where: [
								{
									field: "id",
									value: deviceCodeRecord.id,
								},
							],
						});
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.ACCESS_DENIED,
							details: {
								error: "access_denied",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.ACCESS_DENIED,
							},
						});
					}

					if (
						deviceCodeRecord.status === "approved" &&
						deviceCodeRecord.userId
					) {
						// Delete the device code after successful authorization
						await ctx.context.adapter.delete({
							model: "deviceCode",
							where: [
								{
									field: "id",
									value: deviceCodeRecord.id,
								},
							],
						});

						const user = await ctx.context.internalAdapter.findUserById(
							deviceCodeRecord.userId,
						);

						if (!user) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: DEVICE_AUTHORIZATION_ERROR_CODES.USER_NOT_FOUND,
								details: {
									error: "server_error",
									error_description:
										DEVICE_AUTHORIZATION_ERROR_CODES.USER_NOT_FOUND,
								},
							});
						}

						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx,
						);

						if (!session) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message:
									DEVICE_AUTHORIZATION_ERROR_CODES.FAILED_TO_CREATE_SESSION,
								details: {
									error: "server_error",
									error_description:
										DEVICE_AUTHORIZATION_ERROR_CODES.FAILED_TO_CREATE_SESSION,
								},
							});
						}

						// Return OAuth 2.0 compliant token response
						return ctx.json({
							access_token: session.token,
							token_type: "Bearer",
							expires_in: Math.floor(
								(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
							),
							scope: deviceCodeRecord.scope || "",
						});
					}

					throw new APIError("INTERNAL_SERVER_ERROR", {
						message:
							DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE_STATUS,
						details: {
							error: "server_error",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE_STATUS,
						},
					});
				},
			),
			deviceVerify: createAuthEndpoint(
				"/device",
				{
					method: "GET",
					query: z.object({
						user_code: z.string().meta({
							description: "The user code to verify",
						}),
					}),
					metadata: {
						openapi: {
							description: "Display device verification page",
							responses: {
								200: {
									description: "Verification page HTML",
									content: {
										"text/html": {
											schema: {
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					// This endpoint would typically serve an HTML page for user verification
					// For now, we'll return a simple JSON response
					const { user_code } = ctx.query;
					const cleanUserCode = user_code.replace(/-/g, "");

					const deviceCodeRecord = await ctx.context.adapter.findOne<{
						id: string;
						deviceCode: string;
						userCode: string;
						userId?: string;
						expiresAt: Date;
						status: string;
						lastPolledAt?: Date;
						pollingInterval?: number;
						clientId?: string;
						scope?: string;
					}>({
						model: "deviceCode",
						where: [
							{
								field: "userCode",
								value: cleanUserCode,
							},
						],
					});

					if (!deviceCodeRecord) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							details: {
								error: "invalid_request",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							},
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							details: {
								error: "expired_token",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							},
						});
					}

					return ctx.json({
						user_code: user_code,
						status: deviceCodeRecord.status,
					});
				},
			),
			deviceApprove: createAuthEndpoint(
				"/device/approve",
				{
					method: "POST",
					body: z.object({
						userCode: z.string().meta({
							description: "The user code to approve",
						}),
					}),
					requireHeaders: true,
					metadata: {
						openapi: {
							description: "Approve device authorization",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					// Check if user is authenticated
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED,
							details: {
								error: "unauthorized",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED,
							},
						});
					}

					const { userCode } = ctx.body;
					const cleanUserCode = userCode.replace(/-/g, "");

					const deviceCodeRecord = await ctx.context.adapter.findOne<{
						id: string;
						deviceCode: string;
						userCode: string;
						userId?: string;
						expiresAt: Date;
						status: string;
						lastPolledAt?: Date;
						pollingInterval?: number;
						clientId?: string;
						scope?: string;
					}>({
						model: "deviceCode",
						where: [
							{
								field: "userCode",
								value: cleanUserCode,
							},
						],
					});

					if (!deviceCodeRecord) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							details: {
								error: "invalid_request",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							},
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							details: {
								error: "expired_token",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							},
						});
					}

					if (deviceCodeRecord.status !== "pending") {
						throw new APIError("BAD_REQUEST", {
							message:
								DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
							details: {
								error: "invalid_request",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
							},
						});
					}

					// Update device code with approved status and user ID
					await ctx.context.adapter.update({
						model: "deviceCode",
						where: [
							{
								field: "id",
								value: deviceCodeRecord.id,
							},
						],
						update: {
							status: "approved",
							userId: session.user.id,
						},
					});

					return ctx.json({
						success: true,
					});
				},
			),
			deviceDeny: createAuthEndpoint(
				"/device/deny",
				{
					method: "POST",
					body: z.object({
						userCode: z.string().meta({
							description: "The user code to deny",
						}),
					}),
					metadata: {
						openapi: {
							description: "Deny device authorization",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													success: {
														type: "boolean",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { userCode } = ctx.body;
					const cleanUserCode = userCode.replace(/-/g, "");

					const deviceCodeRecord = await ctx.context.adapter.findOne<{
						id: string;
						deviceCode: string;
						userCode: string;
						userId?: string;
						expiresAt: Date;
						status: string;
						lastPolledAt?: Date;
						pollingInterval?: number;
						clientId?: string;
						scope?: string;
					}>({
						model: "deviceCode",
						where: [
							{
								field: "userCode",
								value: cleanUserCode,
							},
						],
					});

					if (!deviceCodeRecord) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							details: {
								error: "invalid_request",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
							},
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							message: DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							details: {
								error: "expired_token",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
							},
						});
					}

					if (deviceCodeRecord.status !== "pending") {
						throw new APIError("BAD_REQUEST", {
							message:
								DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
							details: {
								error: "invalid_request",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
							},
						});
					}

					// Update device code with denied status
					await ctx.context.adapter.update({
						model: "deviceCode",
						where: [
							{
								field: "id",
								value: deviceCodeRecord.id,
							},
						],
						update: {
							status: "denied",
						},
					});

					return ctx.json({
						success: true,
					});
				},
			),
		},
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

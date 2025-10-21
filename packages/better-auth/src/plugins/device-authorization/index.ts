import * as z from "zod";
import { APIError } from "better-call";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { InferOptionSchema } from "../../types/plugins";
import type { BetterAuthPlugin } from "@better-auth/core";
import { generateRandomString } from "../../crypto";
import { getSessionFromCtx } from "../../api/routes/session";
import { ms, type StringValue as MSStringValue } from "ms";
import { schema, type DeviceCode } from "./schema";
import { mergeSchema } from "../../db";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";

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
			"The URI where users verify their device code. Can be an absolute URL (https://example.com/device) or relative path (/device). This will be returned as verification_uri in the device code response. If not provided, verification_uri will not be included in the response.",
		),
	schema: z.custom<InferOptionSchema<typeof schema>>(() => true),
});

export type DeviceAuthorizationOptions = z.infer<
	typeof deviceAuthorizationOptionsSchema
>;

const defaultCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * @internal
 */
const defaultGenerateDeviceCode = (length: number) => {
	return generateRandomString(length, "a-z", "A-Z", "0-9");
};

/**
 * @internal
 */
const defaultGenerateUserCode = (length: number) => {
	const chars = new Uint8Array(length);
	return Array.from(crypto.getRandomValues(chars))
		.map((byte) => defaultCharset[byte % defaultCharset.length])
		.join("");
};

/**
 * @internal
 */
const buildVerificationUris = (
	verificationUri: string | undefined,
	baseURL: string,
	userCode: string,
): {
	verificationUri: string | null;
	verificationUriComplete: string | null;
} => {
	if (!verificationUri) {
		return {
			verificationUri: null,
			verificationUriComplete: null,
		};
	}

	let verificationUrl: URL;
	try {
		verificationUrl = new URL(verificationUri);
	} catch {
		verificationUrl = new URL(verificationUri, baseURL);
	}

	const verificationUriCompleteUrl = new URL(verificationUrl);
	verificationUriCompleteUrl.searchParams.set("user_code", userCode);

	const verificationUriString = verificationUrl.toString();
	const verificationUriCompleteString = verificationUriCompleteUrl.toString();

	return {
		verificationUri: verificationUriString,
		verificationUriComplete: verificationUriCompleteString,
	};
};

export const deviceAuthorization = (
	options: Partial<DeviceAuthorizationOptions> = {},
) => {
	const opts = deviceAuthorizationOptionsSchema.parse(options);
	const generateDeviceCode = async () => {
		if (opts.generateDeviceCode) {
			return opts.generateDeviceCode();
		}
		return defaultGenerateDeviceCode(opts.deviceCodeLength);
	};

	const generateUserCode = async () => {
		if (opts.generateUserCode) {
			return opts.generateUserCode();
		}
		return defaultGenerateUserCode(opts.userCodeLength);
	};

	return {
		id: "device-authorization",
		schema: mergeSchema(schema, options?.schema),
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
					error: z.object({
						error: z.enum(["invalid_request", "invalid_client"]).meta({
							description: "Error code",
						}),
						error_description: z.string().meta({
							description: "Detailed error description",
						}),
					}),
					metadata: {
						openapi: {
							description: `Request a device and user code

Follow [rfc8628#section-3.2](https://datatracker.ietf.org/doc/html/rfc8628#section-3.2)`,
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
														format: "uri",
														nullable: true,
														description:
															"The URL for user verification. null if verificationUri option is not configured.",
													},
													verification_uri_complete: {
														type: "string",
														format: "uri",
														nullable: true,
														description:
															"The complete URL with user code as query parameter. null if verificationUri option is not configured.",
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
								400: {
									description: "Error response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: {
														type: "string",
														enum: ["invalid_request", "invalid_client"],
													},
													error_description: {
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
					if (opts.validateClient) {
						const isValid = await opts.validateClient(ctx.body.client_id);
						if (!isValid) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_client",
								error_description: "Invalid client ID",
							});
						}
					}

					if (opts.onDeviceAuthRequest) {
						await opts.onDeviceAuthRequest(ctx.body.client_id, ctx.body.scope);
					}

					const deviceCode = await generateDeviceCode();
					const userCode = await generateUserCode();
					const expiresIn = ms(opts.expiresIn);
					const expiresAt = new Date(Date.now() + expiresIn);

					await ctx.context.adapter.create({
						model: "deviceCode",
						data: {
							deviceCode,
							userCode,
							expiresAt,
							status: "pending",
							pollingInterval: ms(opts.interval),
							clientId: ctx.body.client_id,
							scope: ctx.body.scope,
						},
					});

					const { verificationUri, verificationUriComplete } =
						buildVerificationUris(
							opts.verificationUri,
							ctx.context.baseURL,
							userCode,
						);

					return ctx.json(
						{
							device_code: deviceCode,
							user_code: userCode,
							verification_uri: verificationUri,
							verification_uri_complete: verificationUriComplete,
							expires_in: Math.floor(expiresIn / 1000),
							interval: Math.floor(ms(opts.interval) / 1000),
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
					error: z.object({
						error: z
							.enum([
								"authorization_pending",
								"slow_down",
								"expired_token",
								"access_denied",
								"invalid_request",
								"invalid_grant",
							])
							.meta({
								description: "Error code",
							}),
						error_description: z.string().meta({
							description: "Detailed error description",
						}),
					}),
					metadata: {
						openapi: {
							description: `Exchange device code for access token

Follow [rfc8628#section-3.4](https://datatracker.ietf.org/doc/html/rfc8628#section-3.4)`,
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
															"invalid_request",
															"invalid_grant",
														],
													},
													error_description: {
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
					const { device_code, client_id } = ctx.body;

					if (opts.validateClient) {
						const isValid = await opts.validateClient(client_id);
						if (!isValid) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_grant",
								error_description: "Invalid client ID",
							});
						}
					}

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
							error: "invalid_grant",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE,
						});
					}

					if (
						deviceCodeRecord.clientId &&
						deviceCodeRecord.clientId !== client_id
					) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_grant",
							error_description: "Client ID mismatch",
						});
					}

					// Check for rate limiting
					if (
						deviceCodeRecord.lastPolledAt &&
						deviceCodeRecord.pollingInterval
					) {
						const timeSinceLastPoll =
							Date.now() - new Date(deviceCodeRecord.lastPolledAt).getTime();
						const minInterval = deviceCodeRecord.pollingInterval;

						if (timeSinceLastPoll < minInterval) {
							throw new APIError("BAD_REQUEST", {
								error: "slow_down",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.POLLING_TOO_FREQUENTLY,
							});
						}
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
							error: "expired_token",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_DEVICE_CODE,
						});
					}

					if (deviceCodeRecord.status === "pending") {
						throw new APIError("BAD_REQUEST", {
							error: "authorization_pending",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.AUTHORIZATION_PENDING,
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
							error: "access_denied",
							error_description: DEVICE_AUTHORIZATION_ERROR_CODES.ACCESS_DENIED,
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
								error: "server_error",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.USER_NOT_FOUND,
							});
						}

						const session = await ctx.context.internalAdapter.createSession(
							user.id,
						);

						if (!session) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								error: "server_error",
								error_description:
									DEVICE_AUTHORIZATION_ERROR_CODES.FAILED_TO_CREATE_SESSION,
							});
						}

						// Set new session context for hooks and plugins
						// (matches setSessionCookie logic)
						ctx.context.setNewSession({
							session,
							user,
						});

						// If secondary storage is enabled, store the session data in the secondary storage
						// (matches setSessionCookie logic)
						if (ctx.context.options.secondaryStorage) {
							await ctx.context.secondaryStorage?.set(
								session.token,
								JSON.stringify({
									user,
									session,
								}),
								Math.floor(
									(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
								),
							);
						}

						// Return OAuth 2.0 compliant token response
						return ctx.json(
							{
								access_token: session.token,
								token_type: "Bearer",
								expires_in: Math.floor(
									(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
								),
								scope: deviceCodeRecord.scope || "",
							},
							{
								headers: {
									"Cache-Control": "no-store",
									Pragma: "no-cache",
								},
							},
						);
					}

					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description:
							DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE_STATUS,
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
					error: z.object({
						error: z.enum(["invalid_request"]).meta({
							description: "Error code",
						}),
						error_description: z.string().meta({
							description: "Detailed error description",
						}),
					}),
					metadata: {
						openapi: {
							description:
								"Verify user code and get device authorization status",
							responses: {
								200: {
									description: "Device authorization status",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user_code: {
														type: "string",
														description: "The user code to verify",
													},
													status: {
														type: "string",
														enum: ["pending", "approved", "denied"],
														description:
															"Current status of the device authorization",
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
					const { user_code } = ctx.query;
					const cleanUserCode = user_code.replace(/-/g, "");

					const deviceCodeRecord =
						await ctx.context.adapter.findOne<DeviceCode>({
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
							error: "invalid_request",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							error: "expired_token",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
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
					error: z.object({
						error: z
							.enum([
								"invalid_request",
								"expired_token",
								"device_code_already_processed",
							])
							.meta({
								description: "Error code",
							}),
						error_description: z.string().meta({
							description: "Detailed error description",
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
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							error: "unauthorized",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED,
						});
					}

					const { userCode } = ctx.body;

					const deviceCodeRecord =
						await ctx.context.adapter.findOne<DeviceCode>({
							model: "deviceCode",
							where: [
								{
									field: "userCode",
									value: userCode,
								},
							],
						});

					if (!deviceCodeRecord) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							error: "expired_token",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
						});
					}

					if (deviceCodeRecord.status !== "pending") {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
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
					error: z.object({
						error: z.enum(["invalid_request", "expired_token"]).meta({
							description: "Error code",
						}),
						error_description: z.string().meta({
							description: "Detailed error description",
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

					const deviceCodeRecord =
						await ctx.context.adapter.findOne<DeviceCode>({
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
							error: "invalid_request",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE,
						});
					}

					if (deviceCodeRecord.expiresAt < new Date()) {
						throw new APIError("BAD_REQUEST", {
							error: "expired_token",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE,
						});
					}

					if (deviceCodeRecord.status !== "pending") {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description:
								DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED,
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

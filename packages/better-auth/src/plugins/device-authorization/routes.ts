import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { generateRandomString } from "../../crypto";
import { ms } from "../../utils/time";
import type { DeviceAuthorizationOptions } from ".";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";
import {
	createDeviceJwtAccessToken,
	parseStoredResource,
	requireJwtOptions,
	resolveResourceAudience,
	serializeResource,
} from "./resource";
import type { DeviceCode } from "./schema";

/* cspell:disable-next-line */
const defaultCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const deviceCodeBodySchema = z.object({
	client_id: z.string().meta({
		description: "The client ID of the application",
	}),
	user_id: z
		.string()
		.meta({
			description: "The user ID to which the device code should be pre-bound.",
		})
		.optional(),
	scope: z
		.string()
		.meta({
			description: "Space-separated list of scopes",
		})
		.optional(),
	resource: z
		.union([z.string(), z.array(z.string())])
		.meta({
			description:
				"RFC 8707 resource indicator(s) the issued access token is intended for. Requesting a valid resource yields a JWT access token audienced at it.",
		})
		.optional(),
});

const deviceCodeErrorSchema = z.object({
	error: z.enum(["invalid_request", "invalid_client", "invalid_target"]).meta({
		description: "Error code",
	}),
	error_description: z.string().meta({
		description: "Detailed error description",
	}),
});

export const deviceCode = (opts: DeviceAuthorizationOptions) => {
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
	return createAuthEndpoint(
		"/device/code",
		{
			method: "POST",
			body: deviceCodeBodySchema,
			error: deviceCodeErrorSchema,
			metadata: {
				noStore: true,
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
												description:
													"The URL for user verification. Defaults to /device if not configured.",
											},
											verification_uri_complete: {
												type: "string",
												format: "uri",
												description:
													"The complete URL with user code as query parameter.",
											},
											expires_in: {
												type: "number",
												description: "Lifetime in seconds of the device code",
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
												enum: [
													"invalid_request",
													"invalid_client",
													"invalid_target",
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
			if (opts.validateClient) {
				const isValid = await opts.validateClient(ctx.body.client_id);
				if (!isValid) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: "Invalid client ID",
					});
				}
			}

			let resourceToStore: string | null = null;
			if (ctx.body.resource !== undefined) {
				const audience = resolveResourceAudience({
					opts,
					boundResource: undefined,
					requestedResource: ctx.body.resource,
				});
				resourceToStore = audience ? serializeResource(audience) : null;
			}

			if (opts.onDeviceAuthRequest) {
				await opts.onDeviceAuthRequest(
					ctx.body.client_id,
					ctx.body.scope,
					ctx.body.resource,
				);
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
					userId: ctx.body.user_id || null, // An empty user_id is treated as omitted, per RFC 8628 section 3.1
					expiresAt,
					status: "pending",
					pollingInterval: ms(opts.interval),
					clientId: ctx.body.client_id,
					scope: ctx.body.scope,
					resource: resourceToStore,
				},
			});

			const { verificationUri, verificationUriComplete } =
				buildVerificationUris(
					opts.verificationUri,
					ctx.context.baseURL,
					userCode,
				);

			ctx.setHeader("Cache-Control", "no-store");
			ctx.setHeader("Pragma", "no-cache");
			return ctx.json({
				device_code: deviceCode,
				user_code: userCode,
				verification_uri: verificationUri,
				verification_uri_complete: verificationUriComplete,
				expires_in: Math.floor(expiresIn / 1000),
				interval: Math.floor(ms(opts.interval) / 1000),
			});
		},
	);
};

const deviceTokenBodySchema = z.object({
	grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code").meta({
		description: "The grant type for device flow",
	}),
	device_code: z.string().meta({
		description: "The device verification code",
	}),
	client_id: z.string().meta({
		description: "The client ID of the application",
	}),
	resource: z
		.union([z.string(), z.array(z.string())])
		.meta({
			description:
				"RFC 8707 resource indicator(s). Must equal or be a subset of the resource bound at /device/code. A valid resource yields a JWT access token.",
		})
		.optional(),
});

const deviceTokenErrorSchema = z.object({
	error: z
		.enum([
			"authorization_pending",
			"slow_down",
			"expired_token",
			"access_denied",
			"invalid_request",
			"invalid_grant",
			"invalid_target",
		])
		.meta({
			description: "Error code",
		}),
	error_description: z.string().meta({
		description: "Detailed error description",
	}),
});

export const deviceToken = (opts: DeviceAuthorizationOptions) =>
	createAuthEndpoint(
		"/device/token",
		{
			method: "POST",
			body: deviceTokenBodySchema,
			error: deviceTokenErrorSchema,
			metadata: {
				noStore: true,
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
											access_token: {
												type: "string",
												description:
													"The access token. An opaque session token by default, or an RFC 9068 JWT when a valid `resource` was requested.",
											},
											token_type: { type: "string", enum: ["Bearer"] },
											expires_in: { type: "number" },
											scope: { type: "string" },
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
													"invalid_target",
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
				userId?: string | undefined;
				expiresAt: Date;
				status: string;
				lastPolledAt?: Date | undefined;
				pollingInterval?: number | undefined;
				clientId?: string | undefined;
				scope?: string | undefined;
				resource?: string | undefined;
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
						DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE.message,
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
			if (deviceCodeRecord.lastPolledAt && deviceCodeRecord.pollingInterval) {
				const timeSinceLastPoll =
					Date.now() - new Date(deviceCodeRecord.lastPolledAt).getTime();
				const minInterval = deviceCodeRecord.pollingInterval;

				if (timeSinceLastPoll < minInterval) {
					throw new APIError("BAD_REQUEST", {
						error: "slow_down",
						error_description:
							DEVICE_AUTHORIZATION_ERROR_CODES.POLLING_TOO_FREQUENTLY.message,
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
						DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_DEVICE_CODE.message,
				});
			}

			if (deviceCodeRecord.status === "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "authorization_pending",
					error_description:
						DEVICE_AUTHORIZATION_ERROR_CODES.AUTHORIZATION_PENDING.message,
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
					error_description:
						DEVICE_AUTHORIZATION_ERROR_CODES.ACCESS_DENIED.message,
				});
			}

			if (deviceCodeRecord.status === "approved" && deviceCodeRecord.userId) {
				// Resolve/validate the requested resource BEFORE consuming the code.
				// Validation is read-only and idempotent, so a malformed or
				// disallowed `resource` (or an `allowedResources` change after the
				// code was issued) returns `invalid_target` without burning the
				// approved code and forcing a full device-flow restart (RFC 8707 §2.2).
				const audience = resolveResourceAudience({
					opts,
					boundResource: parseStoredResource(deviceCodeRecord.resource),
					requestedResource: ctx.body.resource,
					// Token-endpoint policy: a resource must have been authorized at
					// `/device/code`; reject a token-time-only resource.
					requireBinding: true,
				});

				// If a JWT will be minted, confirm the jwt plugin is available
				// BEFORE consuming the code, so a misconfigured server (resource
				// allowed but jwt() not registered) doesn't burn the approval.
				if (audience) {
					requireJwtOptions(ctx);
				}

				// Atomically claim the approved code as the single race gate:
				// concurrent polls contend on this delete-and-return, and only the
				// caller that removes the row may issue a token. Losers receive
				// null and are rejected, so the code is redeemed at most once.
				const claimedDeviceCode = await ctx.context.adapter.consumeOne<{
					id: string;
					userId?: string | undefined;
					scope?: string | undefined;
				}>({
					model: "deviceCode",
					where: [
						{ field: "id", value: deviceCodeRecord.id },
						{ field: "clientId", value: client_id },
						{ field: "status", value: "approved" },
					],
				});

				if (!claimedDeviceCode?.userId) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description:
							DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE.message,
					});
				}

				const user = await ctx.context.internalAdapter.findUserById(
					claimedDeviceCode.userId,
				);

				if (!user) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description:
							DEVICE_AUTHORIZATION_ERROR_CODES.USER_NOT_FOUND.message,
					});
				}

				// RFC 8707 / RFC 9068: when a resource resolved, issue a stateless
				// JWT access token scoped to that audience instead of an opaque session.
				if (audience) {
					const { token, expiresIn } = await createDeviceJwtAccessToken({
						ctx,
						opts,
						user,
						clientId: client_id,
						scope: claimedDeviceCode.scope || "",
						audience,
					});
					ctx.setHeader("Cache-Control", "no-store");
					ctx.setHeader("Pragma", "no-cache");
					return ctx.json({
						access_token: token,
						token_type: "Bearer",
						expires_in: expiresIn,
						scope: claimedDeviceCode.scope || "",
					});
				}

				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);

				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description:
							DEVICE_AUTHORIZATION_ERROR_CODES.FAILED_TO_CREATE_SESSION.message,
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
				ctx.setHeader("Cache-Control", "no-store");
				ctx.setHeader("Pragma", "no-cache");
				return ctx.json({
					access_token: session.token,
					token_type: "Bearer",
					expires_in: Math.floor(
						(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
					),
					scope: claimedDeviceCode.scope || "",
				});
			}

			throw new APIError("INTERNAL_SERVER_ERROR", {
				error: "server_error",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_DEVICE_CODE_STATUS.message,
			});
		},
	);

export const deviceVerify = createAuthEndpoint(
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
				description: "Verify user code and get device authorization status",
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
											description: "Current status of the device authorization",
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

		const deviceCodeRecord = await ctx.context.adapter.findOne<DeviceCode>({
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
					DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message,
			});
		}

		if (deviceCodeRecord.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message,
			});
		}

		const session = await getSessionFromCtx(ctx);
		if (
			session?.user?.id &&
			!deviceCodeRecord.userId &&
			deviceCodeRecord.status === "pending"
		) {
			const claimedDeviceCodeRecord =
				await ctx.context.adapter.incrementOne<DeviceCode>({
					model: "deviceCode",
					where: [
						{ field: "id", value: deviceCodeRecord.id },
						{ field: "status", value: "pending" },
						{ field: "userId", operator: "eq", value: null },
					],
					increment: {},
					set: { userId: session.user.id },
				});
			if (claimedDeviceCodeRecord) {
				deviceCodeRecord.userId = session.user.id;
			}
		}

		return ctx.json({
			user_code: user_code,
			status: deviceCodeRecord.status,
		});
	},
);

export const deviceApprove = createAuthEndpoint(
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
					"unauthorized",
					"access_denied",
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
					DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED.message,
			});
		}

		const { userCode } = ctx.body;
		const cleanUserCode = userCode.replace(/-/g, "");

		const deviceCodeRecord = await ctx.context.adapter.findOne<DeviceCode>({
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
					DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message,
			});
		}

		if (deviceCodeRecord.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message,
			});
		}

		if (deviceCodeRecord.status !== "pending") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED
						.message,
			});
		}

		if (!deviceCodeRecord.userId) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_NOT_CLAIMED.message,
			});
		}

		if (deviceCodeRecord.userId !== session.user.id) {
			throw new APIError("FORBIDDEN", {
				error: "access_denied",
				error_description:
					"You are not authorized to approve this device authorization",
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
);

export const deviceDeny = createAuthEndpoint(
	"/device/deny",
	{
		method: "POST",
		body: z.object({
			userCode: z.string().meta({
				description: "The user code to deny",
			}),
		}),
		error: z.object({
			error: z
				.enum([
					"invalid_request",
					"expired_token",
					"unauthorized",
					"access_denied",
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
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				error: "unauthorized",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.AUTHENTICATION_REQUIRED.message,
			});
		}

		const { userCode } = ctx.body;
		const cleanUserCode = userCode.replace(/-/g, "");

		const deviceCodeRecord = await ctx.context.adapter.findOne<DeviceCode>({
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
					DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_USER_CODE.message,
			});
		}

		if (deviceCodeRecord.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.EXPIRED_USER_CODE.message,
			});
		}

		if (deviceCodeRecord.status !== "pending") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_ALREADY_PROCESSED
						.message,
			});
		}

		if (!deviceCodeRecord.userId) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					DEVICE_AUTHORIZATION_ERROR_CODES.DEVICE_CODE_NOT_CLAIMED.message,
			});
		}

		if (deviceCodeRecord.userId !== session.user.id) {
			throw new APIError("FORBIDDEN", {
				error: "access_denied",
				error_description:
					"You are not authorized to deny this device authorization",
			});
		}

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
				userId: session.user.id,
			},
		});

		return ctx.json({
			success: true,
		});
	},
);

/**
 * @internal
 */
const buildVerificationUris = (
	verificationUri: string | undefined,
	baseURL: string,
	userCode: string,
): {
	verificationUri: string;
	verificationUriComplete: string;
} => {
	const uri = verificationUri || "/device";

	let verificationUrl: URL;
	try {
		verificationUrl = new URL(uri);
	} catch {
		verificationUrl = new URL(uri, baseURL);
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

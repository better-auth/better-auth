import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { generateRandomString } from "../../crypto";
import { ms } from "../../utils/time";
import type { DeviceAuthorizationOptions } from ".";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";
import type { DeviceCode } from "./schema";
import { DEVICE_AUTHORIZATION_CODE_MAX_LENGTH } from "./schema";

/* cspell:disable-next-line */
const defaultCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function validateGeneratedCode(code: unknown, label: "device" | "user") {
	if (typeof code !== "string") {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `Generated ${label} code must be a string`,
		});
	}
	if (Array.from(code).length > DEVICE_AUTHORIZATION_CODE_MAX_LENGTH) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `Generated ${label} code must be at most ${DEVICE_AUTHORIZATION_CODE_MAX_LENGTH} characters`,
		});
	}
	return code;
}

function serializeResource(resource: string | string[]): string {
	return typeof resource === "string" ? resource : JSON.stringify(resource);
}

function parseStoredResource(
	resource: string | null | undefined,
): string | string[] | undefined {
	if (!resource) return undefined;
	if (!resource.startsWith("[")) return resource;
	try {
		const parsed: unknown = JSON.parse(resource);
		if (
			Array.isArray(parsed) &&
			parsed.every((value): value is string => typeof value === "string")
		) {
			return parsed;
		}
	} catch {
		// Treat legacy/unrecognized stored values as a single resource string.
	}
	return resource;
}

async function extractFormResources(
	request: Request | undefined,
): Promise<string[] | undefined> {
	const contentType = request?.headers.get("content-type")?.toLowerCase() ?? "";
	if (!request || !contentType.includes("application/x-www-form-urlencoded")) {
		return undefined;
	}
	try {
		const params = new URLSearchParams(await request.text());
		if (!params.has("resource")) return undefined;
		return params.getAll("resource").filter(Boolean);
	} catch {
		return undefined;
	}
}

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
				"RFC 8707 resource indicator(s) to bind to this authorization request",
		})
		.optional(),
});

const deviceCodeErrorSchema = z.object({
	error: z
		.enum([
			"invalid_request",
			"invalid_client",
			"unauthorized_client",
			"invalid_scope",
			"invalid_target",
		])
		.meta({
			description: "Error code",
		}),
	error_description: z.string().meta({
		description: "Detailed error description",
	}),
});

export const deviceCode = (opts: DeviceAuthorizationOptions) => {
	const generateDeviceCode = async () => {
		const code = opts.generateDeviceCode
			? await opts.generateDeviceCode()
			: defaultGenerateDeviceCode(opts.deviceCodeLength);
		return validateGeneratedCode(code, "device");
	};

	const generateUserCode = async () => {
		const code = opts.generateUserCode
			? await opts.generateUserCode()
			: defaultGenerateUserCode(opts.userCodeLength);
		return validateGeneratedCode(code, "user");
	};
	return createAuthEndpoint(
		"/device/code",
		{
			method: "POST",
			cloneRequest: true,
			body: deviceCodeBodySchema,
			error: deviceCodeErrorSchema,
			metadata: {
				noStore: true,
				allowedMediaTypes: [
					"application/json",
					"application/x-www-form-urlencoded",
				],
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
													"unauthorized_client",
													"invalid_scope",
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
			const formResources = await extractFormResources(ctx.request);
			if (formResources) {
				ctx.body.resource =
					formResources.length === 1 ? formResources[0] : formResources;
			}
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
					resource: ctx.body.resource
						? serializeResource(ctx.body.resource)
						: null,
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
				userId?: string | undefined;
				expiresAt: Date;
				status: string;
				lastPolledAt?: Date | undefined;
				pollingInterval?: number | undefined;
				clientId?: string | undefined;
				scope?: string | undefined;
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
				// Atomically claim the approved code as the single race gate:
				// concurrent polls contend on this delete-and-return, and only the
				// caller that removes the row may issue a session. Losers receive
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
										client_id: {
											type: "string",
											description:
												"The client requesting authorization, returned only to the authenticated user who owns this request",
										},
										scope: {
											type: "string",
											description:
												"The requested scopes, returned only to the authenticated user who owns this request",
										},
										resource: {
											oneOf: [
												{ type: "string" },
												{ type: "array", items: { type: "string" } },
											],
											description:
												"The requested resource indicators, returned only to the authenticated user who owns this request",
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

		const canReviewRequest =
			session?.user.id !== undefined &&
			deviceCodeRecord.userId === session.user.id;
		return ctx.json({
			user_code: user_code,
			status: deviceCodeRecord.status,
			...(canReviewRequest
				? {
						client_id: deviceCodeRecord.clientId,
						scope: deviceCodeRecord.scope,
						resource: parseStoredResource(deviceCodeRecord.resource),
					}
				: {}),
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

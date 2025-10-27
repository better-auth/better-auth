import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { sessionMiddleware } from "../../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../../crypto";
import { generateRandomString } from "../../../crypto/random";
import { safeJSONParse } from "../../../utils/json";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { verifyTwoFactor } from "../verify-two-factor";

export interface BackupCodeOptions {
	/**
	 * The amount of backup codes to generate
	 *
	 * @default 10
	 */
	amount?: number;
	/**
	 * The length of the backup codes
	 *
	 * @default 10
	 */
	length?: number;
	/**
	 * An optional custom function to generate backup codes
	 */
	customBackupCodesGenerate?: () => string[];
	/**
	 * How to store the backup codes in the database, whether encrypted or plain.
	 */
	storeBackupCodes?:
		| "plain"
		| "encrypted"
		| {
				encrypt: (token: string) => Promise<string>;
				decrypt: (token: string) => Promise<string>;
		  };
}

function generateBackupCodesFn(options?: BackupCodeOptions) {
	return Array.from({ length: options?.amount ?? 10 })
		.fill(null)
		.map(() => generateRandomString(options?.length ?? 10, "a-z", "0-9", "A-Z"))
		.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);
}

export async function generateBackupCodes(
	secret: string,
	options?: BackupCodeOptions,
) {
	const backupCodes = options?.customBackupCodesGenerate
		? options.customBackupCodesGenerate()
		: generateBackupCodesFn(options);
	if (options?.storeBackupCodes === "encrypted") {
		const encCodes = await symmetricEncrypt({
			data: JSON.stringify(backupCodes),
			key: secret,
		});
		return {
			backupCodes,
			encryptedBackupCodes: encCodes,
		};
	}
	if (
		typeof options?.storeBackupCodes === "object" &&
		"encrypt" in options?.storeBackupCodes
	) {
		return {
			backupCodes,
			encryptedBackupCodes: await options?.storeBackupCodes.encrypt(
				JSON.stringify(backupCodes),
			),
		};
	}
	return {
		backupCodes,
		encryptedBackupCodes: JSON.stringify(backupCodes),
	};
}

export async function verifyBackupCode(
	data: {
		backupCodes: string;
		code: string;
	},
	key: string,
	options?: BackupCodeOptions,
) {
	const codes = await getBackupCodes(data.backupCodes, key, options);
	if (!codes) {
		return {
			status: false,
			updated: null,
		};
	}
	return {
		status: codes.includes(data.code),
		updated: codes.filter((code) => code !== data.code),
	};
}

export async function getBackupCodes(
	backupCodes: string,
	key: string,
	options?: BackupCodeOptions,
) {
	if (options?.storeBackupCodes === "encrypted") {
		const decrypted = await symmetricDecrypt({ key, data: backupCodes });
		return safeJSONParse<string[]>(decrypted);
	}
	if (
		typeof options?.storeBackupCodes === "object" &&
		"decrypt" in options?.storeBackupCodes
	) {
		const decrypted = await options?.storeBackupCodes.decrypt(backupCodes);
		return safeJSONParse<string[]>(decrypted);
	}

	return safeJSONParse<string[]>(backupCodes);
}

export const backupCode2fa = (opts: BackupCodeOptions) => {
	const twoFactorTable = "twoFactor";

	return {
		id: "backup_code",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/verify-backup-code`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyBackupCode`
			 *
			 * **client:**
			 * `authClient.twoFactor.verifyBackupCode`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-verify-backup-code)
			 */
			verifyBackupCode: createAuthEndpoint(
				"/two-factor/verify-backup-code",

				{
					method: "POST",
					body: z.object({
						code: z.string().meta({
							description: `A backup code to verify. Eg: "123456"`,
						}),
						/**
						 * Disable setting the session cookie
						 */
						disableSession: z
							.boolean()
							.meta({
								description: "If true, the session cookie will not be set.",
							})
							.optional(),
						/**
						 * if true, the device will be trusted
						 * for 30 days. It'll be refreshed on
						 * every sign in request within this time.
						 */
						trustDevice: z
							.boolean()
							.meta({
								description:
									"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							description: "Verify a backup code for two-factor authentication",
							responses: {
								"200": {
									description: "Backup code verified successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													user: {
														type: "object",
														properties: {
															id: {
																type: "string",
																description: "Unique identifier of the user",
															},
															email: {
																type: "string",
																format: "email",
																nullable: true,
																description: "User's email address",
															},
															emailVerified: {
																type: "boolean",
																nullable: true,
																description: "Whether the email is verified",
															},
															name: {
																type: "string",
																nullable: true,
																description: "User's name",
															},
															image: {
																type: "string",
																format: "uri",
																nullable: true,
																description: "User's profile image URL",
															},
															twoFactorEnabled: {
																type: "boolean",
																description:
																	"Whether two-factor authentication is enabled for the user",
															},
															createdAt: {
																type: "string",
																format: "date-time",
																description:
																	"Timestamp when the user was created",
															},
															updatedAt: {
																type: "string",
																format: "date-time",
																description:
																	"Timestamp when the user was last updated",
															},
														},
														required: [
															"id",
															"twoFactorEnabled",
															"createdAt",
															"updatedAt",
														],
														description:
															"The authenticated user object with two-factor details",
													},
													session: {
														type: "object",
														properties: {
															token: {
																type: "string",
																description: "Session token",
															},
															userId: {
																type: "string",
																description:
																	"ID of the user associated with the session",
															},
															createdAt: {
																type: "string",
																format: "date-time",
																description:
																	"Timestamp when the session was created",
															},
															expiresAt: {
																type: "string",
																format: "date-time",
																description:
																	"Timestamp when the session expires",
															},
														},
														required: [
															"token",
															"userId",
															"createdAt",
															"expiresAt",
														],
														description:
															"The current session object, included unless disableSession is true",
													},
												},
												required: ["user", "session"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { session, valid } = await verifyTwoFactor(ctx);
					const user = session.user as UserWithTwoFactor;
					const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
						model: twoFactorTable,
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});
					if (!twoFactor) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
						});
					}
					const validate = await verifyBackupCode(
						{
							backupCodes: twoFactor.backupCodes,
							code: ctx.body.code,
						},
						ctx.context.secret,
						opts,
					);
					if (!validate.status) {
						throw new APIError("UNAUTHORIZED", {
							message: TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE,
						});
					}
					const updatedBackupCodes = await symmetricEncrypt({
						key: ctx.context.secret,
						data: JSON.stringify(validate.updated),
					});

					await ctx.context.adapter.updateMany({
						model: twoFactorTable,
						update: {
							backupCodes: updatedBackupCodes,
						},
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});

					if (!ctx.body.disableSession) {
						return valid(ctx);
					}
					return ctx.json({
						token: session.session?.token,
						user: {
							id: session.user?.id,
							email: session.user.email,
							emailVerified: session.user.emailVerified,
							name: session.user.name,
							image: session.user.image,
							createdAt: session.user.createdAt,
							updatedAt: session.user.updatedAt,
						},
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/generate-backup-codes`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.generateBackupCodes`
			 *
			 * **client:**
			 * `authClient.twoFactor.generateBackupCodes`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-generate-backup-codes)
			 */
			generateBackupCodes: createAuthEndpoint(
				"/two-factor/generate-backup-codes",
				{
					method: "POST",
					body: z.object({
						password: z.string().meta({
							description: "The users password.",
						}),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description:
								"Generate new backup codes for two-factor authentication",
							responses: {
								"200": {
									description: "Backup codes generated successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													status: {
														type: "boolean",
														description:
															"Indicates if the backup codes were generated successfully",
														enum: [true],
													},
													backupCodes: {
														type: "array",
														items: { type: "string" },
														description:
															"Array of generated backup codes in plain text",
													},
												},
												required: ["status", "backupCodes"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const user = ctx.context.session.user as UserWithTwoFactor;
					if (!user.twoFactorEnabled) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
						});
					}
					await ctx.context.password.checkPassword(user.id, ctx);
					const backupCodes = await generateBackupCodes(
						ctx.context.secret,
						opts,
					);
					await ctx.context.adapter.updateMany({
						model: twoFactorTable,
						update: {
							backupCodes: backupCodes.encryptedBackupCodes,
						},
						where: [
							{
								field: "userId",
								value: ctx.context.session.user.id,
							},
						],
					});
					return ctx.json({
						status: true,
						backupCodes: backupCodes.backupCodes,
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET `/two-factor/view-backup-codes`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.viewBackupCodes`
			 *
			 * **client:**
			 * `authClient.twoFactor.viewBackupCodes`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-view-backup-codes)
			 */
			viewBackupCodes: createAuthEndpoint(
				"/two-factor/view-backup-codes",
				{
					method: "GET",
					body: z.object({
						userId: z.coerce.string().meta({
							description: `The user ID to view all backup codes. Eg: "user-id"`,
						}),
					}),
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
						model: twoFactorTable,
						where: [
							{
								field: "userId",
								value: ctx.body.userId,
							},
						],
					});
					if (!twoFactor) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
						});
					}
					const decryptedBackupCodes = await getBackupCodes(
						twoFactor.backupCodes,
						ctx.context.secret,
						opts,
					);

					if (!decryptedBackupCodes) {
						throw new APIError("BAD_REQUEST", {
							message: TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE,
						});
					}
					return ctx.json({
						status: true,
						backupCodes: decryptedBackupCodes,
					});
				},
			),
		},
	} satisfies TwoFactorProvider;
};

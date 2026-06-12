import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, getSessionFromCtx } from "../../api";
import { isAPIError } from "../../utils/is-api-error";
import { ERROR_CODES } from "./error-codes";
import { schema } from "./schema";

export interface PasswordHistoryOptions {
	/**
	 * Number of previous passwords to check against
	 *
	 * @default 5
	 */
	historyCount?: number;
	/**
	 * Custom error message when password is reused
	 */
	customPasswordReusedMessage?: string | undefined;
	/**
	 * Paths to check for password reuse
	 *
	 * @default ["/change-password", "/reset-password", "/set-password"]
	 */
	paths?: string[];
}

interface PasswordHistoryEntry {
	id: string;
	userId: string;
	passwordHash: string;
	createdAt: Date;
}

async function checkPasswordHistory(
	password: string,
	userId: string,
	adapter: any,
	passwordVerify: any,
	options: PasswordHistoryOptions,
) {
	if (!password || !userId) return;

	const historyCount = options.historyCount || 5;

	try {
		// First, check against the current password in the account table
		const account = await adapter.findOne({
			model: "account",
			where: [
				{
					field: "userId",
					value: userId,
				},
			],
		});

		if (account && account.password) {
			const isCurrentPassword = await passwordVerify({
				hash: account.password,
				password: password,
			});

			if (isCurrentPassword) {
				throw new APIError("BAD_REQUEST", {
					message:
						options.customPasswordReusedMessage ||
						ERROR_CODES.PASSWORD_REUSED.message,
					code: ERROR_CODES.PASSWORD_REUSED.code,
				});
			}
		}

		// Then check password history for the user
		const history = (await adapter.findMany({
			model: "passwordHistory",
			where: [
				{
					field: "userId",
					value: userId,
				},
			],
			sortBy: {
				field: "createdAt",
				direction: "desc",
			},
			limit: historyCount,
		})) as PasswordHistoryEntry[];

		// Check if the new password matches any historical password
		for (const entry of history) {
			const isMatch = await passwordVerify({
				hash: entry.passwordHash,
				password: password,
			});

			if (isMatch) {
				throw new APIError("BAD_REQUEST", {
					message:
						options.customPasswordReusedMessage ||
						ERROR_CODES.PASSWORD_REUSED.message,
					code: ERROR_CODES.PASSWORD_REUSED.code,
				});
			}
		}
	} catch (error) {
		if (isAPIError(error)) throw error;
		// If history check fails, don't block password change
	}
}

async function storePasswordHash(
	passwordHash: string,
	userId: string,
	adapter: any,
	options: PasswordHistoryOptions,
) {
	if (!passwordHash || !userId) return;

	const historyCount = options.historyCount || 5;

	try {
		// Store the new password hash
		await adapter.create({
			model: "passwordHistory",
			data: {
				userId,
				passwordHash,
				createdAt: new Date(),
			},
		});

		// Cleanup old entries if we exceed the history count
		const allHistory = (await adapter.findMany({
			model: "passwordHistory",
			where: [
				{
					field: "userId",
					value: userId,
				},
			],
			sortBy: {
				field: "createdAt",
				direction: "desc",
			},
		})) as PasswordHistoryEntry[];

		// Delete entries beyond the history count
		if (allHistory.length > historyCount) {
			const toDelete = allHistory.slice(historyCount);
			for (const entry of toDelete) {
				await adapter.delete({
					model: "passwordHistory",
					where: [
						{
							field: "id",
							value: entry.id,
						},
					],
				});
			}
		}
	} catch (_error) {
		// Log error but don't block if storage fails
	}
}

export const passwordHistory = (
	options?: PasswordHistoryOptions | undefined,
) => {
	const paths = options?.paths || [
		"/change-password",
		"/reset-password",
		"/set-password",
	];

	return {
		id: "passwordHistory",
		schema,
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						account: {
							update: {
								async after(data: any) {
									// Store password hash after update
									if (!data.update?.password) {
										return;
									}

									let userId: string | undefined;

									// Try to find userId directly from where clause
									const userIdWhere = data.where?.find(
										(w: any) => w.field === "userId",
									);
									if (userIdWhere) {
										userId = userIdWhere.value;
									} else {
										// If updating by account id, look up the userId
										const idWhere = data.where?.find(
											(w: any) => w.field === "id",
										);
										if (idWhere) {
											const account = await ctx.adapter.findOne({
												model: "account",
												where: [{ field: "id", value: idWhere.value }],
											});
											if (account) {
												userId = (account as any).userId;
											}
										}
									}

									if (userId) {
										await storePasswordHash(
											data.update.password,
											userId,
											ctx.adapter,
											options || {},
										);
									}
								},
							},
							create: {
								async before(account: any) {
									// Capture password from input data before creation
									// The after hook might not receive the password field from the database
									if (account.password && account.userId) {
										await storePasswordHash(
											account.password,
											account.userId,
											ctx.adapter,
											options || {},
										);
									}
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			before: paths.map((path) => ({
				matcher: (context) => {
					return context.path === path;
				},
				handler: createAuthMiddleware(async (ctx) => {
					// Extract userId and password based on the endpoint
					let userId: string | undefined;
					let password: string | undefined;

					if (path === "/change-password" || path === "/set-password") {
						// Try to get session with headers
						const session = await getSessionFromCtx(ctx);

						if (session?.user?.id) {
							userId = session.user.id;
							password = ctx.body?.newPassword || (ctx.body as any)?.password;
						} else {
							// Fallback: try to extract from token directly if session retrieval fails
							const authHeader =
								ctx.headers?.get?.("authorization") ||
								(ctx.headers as any)?.authorization;
							if (authHeader?.startsWith("Bearer ")) {
								const token = authHeader.substring(7);
								// Decode the token to get userId
								const sessionData = await ctx.context.adapter.findOne({
									model: "session",
									where: [{ field: "token", value: token }],
								});
								if (sessionData && (sessionData as any).userId) {
									userId = (sessionData as any).userId;
									password =
										ctx.body?.newPassword || (ctx.body as any)?.password;
								}
							}
						}
					} else if (path === "/reset-password") {
						// For reset-password, we need to get userId from verification token
						const token = ctx.body?.token || ctx.query?.token;
						if (token) {
							const verification =
								await ctx.context.internalAdapter.findVerificationValue(
									`reset-password:${token}`,
								);
							if (verification) {
								userId = verification.value;
								password = ctx.body?.newPassword;
							}
						}
					}

					// Check password history if we have both userId and password
					if (userId && password) {
						try {
							await checkPasswordHistory(
								password,
								userId,
								ctx.context.adapter,
								ctx.context.password.verify,
								options || {},
							);

							// Store the new password hash AFTER it passes validation
							// We need to hash it first
							const newPasswordHash = await ctx.context.password.hash(password);
							await storePasswordHash(
								newPasswordHash,
								userId,
								ctx.context.adapter,
								options || {},
							);
						} catch (error) {
							throw error; // Re-throw
						}
					}
				}),
			})),
		},
		options,
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

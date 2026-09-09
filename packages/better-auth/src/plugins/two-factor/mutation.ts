import type { GenericEndpointContext } from "@better-auth/core";
import {
	getCurrentAdapter,
	queueAfterTransactionHook,
	runWithTransaction,
} from "@better-auth/core/context";
import type { DBTransactionAdapter } from "@better-auth/core/db/adapter";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { setSessionCookie } from "../../cookies";
import type { Session } from "../../types";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { UserWithTwoFactor } from "./types";

export function assertTwoFactorTransaction(ctx: GenericEndpointContext) {
	if (
		!ctx.context.adapter.options?.adapterConfig.transaction ||
		ctx.context.adapter.id === "memory" ||
		ctx.context.options.secondaryStorage
	) {
		throw APIError.from(
			"BAD_REQUEST",
			TWO_FACTOR_ERROR_CODES.TWO_FACTOR_REQUIRES_TRANSACTION,
		);
	}
}

export async function runTwoFactorMutation<T>(
	ctx: GenericEndpointContext,
	userId: string,
	operation: (
		user: UserWithTwoFactor,
		adapter: DBTransactionAdapter,
	) => Promise<T>,
): Promise<T> {
	assertTwoFactorTransaction(ctx);
	return runWithTransaction(
		ctx.context.adapter,
		async () => {
			const adapter = await getCurrentAdapter(ctx.context.adapter);
			const user = await adapter.incrementOne<UserWithTwoFactor>({
				model: "user",
				where: [{ field: "id", value: userId }],
				increment: { twoFactorVersion: 1 },
			});
			if (!user)
				throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.USER_NOT_FOUND);
			const activeSession = ctx.context.session?.session;
			if (
				activeSession &&
				!(await adapter.findOne({
					model: "session",
					where: [
						{ field: "token", value: activeSession.token },
						{ field: "userId", value: userId },
						{ field: "expiresAt", operator: "gt", value: new Date() },
					],
				}))
			) {
				throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.SESSION_EXPIRED);
			}
			return operation(user, adapter);
		},
		{
			onAfterCommitHookError: (error) => {
				ctx.context.logger.error("Two-factor post-commit hook failed", error);
			},
		},
	);
}

export async function rotateTwoFactorSession(
	ctx: GenericEndpointContext,
	user: UserWithTwoFactor,
	activeSession: Session,
): Promise<Session> {
	const session = await ctx.context.internalAdapter.createSession(
		user.id,
		false,
		activeSession,
	);
	if (!session || session.userId !== user.id) {
		throw APIError.from(
			"BAD_REQUEST",
			BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
		);
	}
	await ctx.context.internalAdapter.deleteSession(activeSession.token);
	const adapter = await getCurrentAdapter(ctx.context.adapter);
	if (
		await adapter.findOne({
			model: "session",
			where: [{ field: "token", value: activeSession.token }],
		})
	) {
		throw APIError.from(
			"BAD_REQUEST",
			TWO_FACTOR_ERROR_CODES.FAILED_TO_UPDATE_TWO_FACTOR,
		);
	}
	await queueAfterTransactionHook(() =>
		setSessionCookie(ctx, { session, user }),
	);
	return session;
}

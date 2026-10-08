import type { GenericEndpointContext } from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";

export function assertPasswordNotTooShort(
	ctx: GenericEndpointContext,
	password: string,
) {
	if (password.length < ctx.context.password.config.minPasswordLength) {
		ctx.context.logger.warn("Password is too short");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
	}
}

export function assertPasswordNotTooLong(
	ctx: GenericEndpointContext,
	password: string,
) {
	if (password.length > ctx.context.password.config.maxPasswordLength) {
		ctx.context.logger.warn("Password is too long");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
	}
}

/**
 * Sets a user's credential password after a reset, revoking their sessions
 * when `emailAndPassword.revokeSessionsOnPasswordReset` is enabled.
 *
 * Revocation and the password write run in one transaction, so a failure in
 * either leaves both unchanged. Sessions are revoked first so that on an
 * adapter without transactions a failure still keeps the old password rather
 * than committing a new one while existing sessions stay valid.
 */
export async function resetCredentialPassword(
	ctx: GenericEndpointContext,
	userId: string,
	passwordHash: string,
) {
	await runWithTransaction(ctx.context.adapter, async () => {
		if (ctx.context.options.emailAndPassword?.revokeSessionsOnPasswordReset) {
			await ctx.context.internalAdapter.deleteUserSessions(userId);
		}
		const account =
			await ctx.context.internalAdapter.findCredentialAccount(userId);
		if (!account) {
			await ctx.context.internalAdapter.createAccount({
				userId,
				providerId: "credential",
				accountId: userId,
				password: passwordHash,
			});
			return;
		}
		await ctx.context.internalAdapter.updatePassword(userId, passwordHash);
	});
}

export async function validatePassword(
	ctx: GenericEndpointContext,
	data: {
		password: string;
		userId: string;
	},
) {
	assertPasswordNotTooLong(ctx, data.password);
	const credentialAccount =
		await ctx.context.internalAdapter.findCredentialAccount(data.userId);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword) {
		return false;
	}
	const compare = await ctx.context.password.verify({
		hash: currentPassword,
		password: data.password,
	});
	return compare;
}

export async function checkPassword(userId: string, c: GenericEndpointContext) {
	const password = c.body.password;
	if (typeof password === "string") {
		assertPasswordNotTooLong(c, password);
	}
	const credentialAccount =
		await c.context.internalAdapter.findCredentialAccount(userId);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword || !password) {
		// Same error as a failed verify to avoid credential / account enumeration.
		if (password) {
			await c.context.password.hash(password);
		}
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
	const compare = await c.context.password.verify({
		hash: currentPassword,
		password,
	});
	if (!compare) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
	}
	return true;
}

export async function shouldRequirePassword(
	ctx: GenericEndpointContext,
	userId: string,
	allowPasswordless?: boolean,
): Promise<boolean> {
	if (!allowPasswordless) {
		return true;
	}

	const credentialAccount =
		await ctx.context.internalAdapter.findCredentialAccount(userId);

	return Boolean(credentialAccount?.password);
}

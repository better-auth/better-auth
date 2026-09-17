import type { GenericEndpointContext } from "@better-auth/core";
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

/**
 * Every endpoint that hands a password to `password.hash` / `password.verify`
 * calls this first, before any account lookup, so an over-long input is
 * rejected at the same cost whether or not the account exists.
 */
export function assertPasswordNotTooLong(
	ctx: GenericEndpointContext,
	password: string,
) {
	if (password.length > ctx.context.password.config.maxPasswordLength) {
		ctx.context.logger.warn("Password is too long");
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
	}
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

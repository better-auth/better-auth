import type {
	GenericEndpointContext,
	PasswordVerifyResult,
} from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";

/**
 * Sentinel returned by a password `verify` function to signal that the password
 * is valid but the stored hash is outdated and should be re-hashed.
 */
const PASSWORD_REHASH_NEEDED = "success-rehash-needed" as const;

/**
 * Re-hash and persist a password when `verify` reported the stored hash is
 * outdated. This is opportunistic: a failure to write the new hash must never
 * block an otherwise-valid authentication, so errors are logged and swallowed.
 */
export async function rehashPasswordIfNeeded(
	ctx: GenericEndpointContext,
	data: {
		accountId: string;
		password: string;
		verifyResult: PasswordVerifyResult;
	},
) {
	if (data.verifyResult !== PASSWORD_REHASH_NEEDED) {
		return;
	}
	try {
		const newHash = await ctx.context.password.hash(data.password);
		await ctx.context.internalAdapter.updateAccount(data.accountId, {
			password: newHash,
		});
	} catch (error) {
		ctx.context.logger.error(
			"Failed to re-hash password after verification",
			error,
		);
	}
}

export async function validatePassword(
	ctx: GenericEndpointContext,
	data: {
		password: string;
		userId: string;
	},
) {
	const accounts = await ctx.context.internalAdapter.findAccounts(data.userId);
	const credentialAccount = accounts?.find(
		(account) => account.providerId === "credential",
	);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword) {
		return false;
	}
	const compare = await ctx.context.password.verify({
		hash: currentPassword,
		password: data.password,
	});
	await rehashPasswordIfNeeded(ctx, {
		accountId: credentialAccount.id,
		password: data.password,
		verifyResult: compare,
	});
	return Boolean(compare);
}

export async function checkPassword(userId: string, c: GenericEndpointContext) {
	const accounts = await c.context.internalAdapter.findAccounts(userId);
	const credentialAccount = accounts?.find(
		(account) => account.providerId === "credential",
	);
	const currentPassword = credentialAccount?.password;
	const password = c.body.password;
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
	await rehashPasswordIfNeeded(c, {
		accountId: credentialAccount.id,
		password,
		verifyResult: compare,
	});
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

	const accounts = await ctx.context.internalAdapter.findAccounts(userId);
	const credentialAccount = accounts?.find(
		(account) => account.providerId === "credential" && account.password,
	);

	return Boolean(credentialAccount);
}

import type {
	GenericEndpointContext,
	PasswordVerifyResult,
} from "@better-auth/core";
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
 * `consumeResetToken` spends the single-use reset token or OTP and throws when
 * it is no longer valid. It runs first inside the same transaction as
 * revocation and the password write, so a failure in any of them leaves all
 * three unchanged and the user can retry. Verification values held only in
 * secondary storage are consumed with `getAndDelete`, which can't roll back,
 * so a later failure there still spends the token. Secondary-storage sessions are
 * removed by an after-commit hook, so they can't roll back with the write.
 * Sessions are revoked before the write so that on an adapter without
 * transactions a failure still keeps the old password rather than committing a
 * new one while existing sessions stay valid.
 */
export async function resetCredentialPassword(
	ctx: GenericEndpointContext,
	userId: string,
	passwordHash: string,
	consumeResetToken?: () => Promise<void>,
) {
	await runWithTransaction(ctx.context.adapter, async () => {
		await consumeResetToken?.();
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

/**
 * Sentinel returned by a password `verify` function to signal that the password
 * is valid but the stored hash is outdated and should be re-hashed.
 */
const PASSWORD_REHASH_NEEDED = "success-rehash-needed" as const;

/**
 * Re-hash and persist a password when `verify` reported the stored hash is
 * outdated. This is opportunistic: a failure to write the new hash must never
 * block an otherwise-valid authentication, so errors are logged and swallowed.
 *
 * `currentHash` is the hash that was just verified; the upgrade is written
 * conditionally on the stored hash still matching it, in one write, so a
 * re-hash of the old password can never clobber a concurrent password change
 * or reset.
 *
 * When `advanced.backgroundTasks.handler` is configured, the re-hash is handed
 * to it so the response does not wait on the extra hash and write.
 */
export async function rehashPasswordIfNeeded(
	ctx: GenericEndpointContext,
	data: {
		accountId: string;
		password: string;
		currentHash: string;
		verifyResult: PasswordVerifyResult;
	},
) {
	if (data.verifyResult !== PASSWORD_REHASH_NEEDED) {
		return;
	}
	// Without a background task handler this is awaited, as before.
	await ctx.context.runInBackgroundOrAwait(
		(async () => {
			const newHash = await ctx.context.password.hash(data.password);
			const updated =
				await ctx.context.internalAdapter.updatePasswordIfUnchanged(
					data.accountId,
					data.currentHash,
					newHash,
				);
			if (!updated) {
				ctx.context.logger.warn(
					"Password re-hash was not saved: the stored hash changed or an account update hook cancelled the write",
					{ accountId: data.accountId },
				);
			}
		})().catch((error) =>
			ctx.context.logger.error(
				"Failed to re-hash password after verification",
				error,
			),
		),
	);
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
	await rehashPasswordIfNeeded(ctx, {
		accountId: credentialAccount.id,
		password: data.password,
		currentHash: currentPassword,
		verifyResult: compare,
	});
	return Boolean(compare);
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
	await rehashPasswordIfNeeded(c, {
		accountId: credentialAccount.id,
		password,
		currentHash: currentPassword,
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

	const credentialAccount =
		await ctx.context.internalAdapter.findCredentialAccount(userId);

	return Boolean(credentialAccount?.password);
}

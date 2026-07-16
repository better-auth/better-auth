import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";

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
	return compare;
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

/**
 * Whether the current session counts as recently authenticated.
 * Mirrors `freshSessionMiddleware`: `freshAge === 0` disables freshness.
 */
export function isSessionFresh(ctx: GenericEndpointContext): boolean {
	const session = ctx.context.session?.session;
	if (!session) return false;
	const freshAge = ctx.context.sessionConfig.freshAge;
	if (freshAge === 0) return false;
	const createdAt = new Date(session.createdAt).getTime();
	if (Number.isNaN(createdAt)) return false;
	return Date.now() - createdAt < freshAge * 1000;
}

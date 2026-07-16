import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";

export async function validatePassword(
	ctx: GenericEndpointContext,
	data: {
		password: string;
		userId: string;
	},
) {
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
	const credentialAccount =
		await c.context.internalAdapter.findCredentialAccount(userId);
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

	const credentialAccount =
		await ctx.context.internalAdapter.findCredentialAccount(userId);

	return Boolean(credentialAccount?.password);
}

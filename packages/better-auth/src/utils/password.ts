import { APIError } from "better-call";
import type { GenericEndpointContext } from "../types/context";

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
	const compare = await ctx.context.password.verify(
		currentPassword,
		data.password,
	);
	return compare;
}

export async function checkPassword(userId: string, c: GenericEndpointContext) {
	const accounts = await c.context.internalAdapter.findAccounts(userId);
	const credentialAccount = accounts?.find(
		(account) => account.providerId === "credential",
	);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword) {
		throw new APIError("BAD_REQUEST", {
			message: "No password credential found",
		});
	}
	const compare = await c.context.password.verify(
		currentPassword,
		c.body.password,
	);
	if (!compare) {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid password",
		});
	}
	return true;
}

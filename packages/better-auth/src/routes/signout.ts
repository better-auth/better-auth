import { deleteSessionCooke } from "../cookies";
import { withPlugins } from "../plugins/utils";
import type { Context } from "./types";

export type SignOutContext = Context;

export const signOut = async (context: SignOutContext) => {
	const session = context.request.cookies.get(
		context.cookies.sessionToken.name,
	);
	deleteSessionCooke(context);
	if (session) {
		try {
			await context.adapter.deleteSession(session, context);
		} catch (e) {}
	}
	return {
		status: 200,
	};
};

export const signOutHandler = withPlugins(signOut);

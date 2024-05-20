import { setSessionCookie } from "../cookies";
import type { Context } from "../routes/types";

export const createSession = async (userId: string, context: Context) => {
	const session = await context.adapter.createSession(userId, context);
	setSessionCookie(context, session.id);
	return session;
};

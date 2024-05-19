import { deleteSessionCooke } from "../cookies";
import { withPlugins } from "../plugins/utils";
import type { Context, InternalResponse } from "./types";

export type SessionContext = Context;

export type SessionResponse = Omit<
	Awaited<ReturnType<typeof session>> extends infer B
		? B extends { status: 200; body: infer Body }
			? Body
			: never
		: never,
	"error"
>;

export const session = async (context: SessionContext) => {
	const session = await getServerSession(context);
	if (!session) {
		return {
			status: 401,
			statusText: "Unauthorize",
		} satisfies InternalResponse;
	}
	return {
		status: 200 as const,
		body: session,
	} satisfies InternalResponse;
};

export const getServerSession = async (context: Context) => {
	const sessionFromCookie = context.request.cookies.get(
		context.cookies.sessionToken.name,
	);
	if (!sessionFromCookie) {
		return null;
	}
	const session = await context.adapter.findSession(sessionFromCookie, context);
	if (!session || session.expiresAt < new Date()) {
		session && (await context.adapter.deleteSession(session.id, context));
		deleteSessionCooke(context);
		return null;
	}
	const user = await context.adapter.findUserById(session.userId, context);
	if (!user) {
		return null;
	}
	const updatedSession = await context.adapter.updateSession(session, context);
	context.request.cookies.set(context.cookies.sessionToken.name, session.id, {
		...context.cookies.sessionToken.options,
		maxAge: updatedSession.expiresAt.valueOf() - Date.now(),
	});
	sessionFromCookie;
	return {
		user,
		expiresAt: session.expiresAt,
	};
};

export const sessionHandler = withPlugins(session);

import { betterFetch } from "@better-fetch/fetch";
import type { Auth } from "../auth";
import type { Session, User } from "../db/schema";
import { NextRequest, NextResponse } from "next/server";

export function toNextJsHandler(auth: Auth | Auth["handler"]) {
	const handler = async (request: Request) => {
		return "handler" in auth ? auth.handler(request) : auth(request);
	};
	return {
		GET: handler,
		POST: handler,
	};
}

/**
 * Middleware that checks if the user is authenticated.
 * If not, it redirects to the redirectTo URL.
 */
export function authMiddleware(options: {
	basePath?: string;
	redirectTo?: string;
	customRedirect?: (
		session: {
			user: User;
			session: Session;
		} | null,
		request: NextRequest,
	) => Promise<any>;
}) {
	return async (request: NextRequest) => {
		if (request.method !== "GET") {
			return NextResponse.next();
		}
		const url = new URL(request.url).origin;
		const basePath = options?.basePath || "/api/auth";
		const fullURL = `${url}${basePath}/session`;

		const res = await betterFetch<{
			session: Session;
			user: User;
		}>(fullURL, {
			headers: request.headers,
		});
		const session = res.data || null;
		if (options.customRedirect) {
			return options.customRedirect(session, request);
		}
		if (!session) {
			return NextResponse.redirect(new URL(options.redirectTo || "/", url));
		}
		return NextResponse.next();
	};
}

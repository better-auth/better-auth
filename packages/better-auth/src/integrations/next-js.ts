import { betterFetch } from "@better-fetch/fetch";
import type { Auth } from "../auth";
import type { Session } from "../adapters/schema";
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
	baePath?: string;
	redirectTo: string;
}) {
	return async (request: Request) => {
		const url = new URL(request.url).origin;
		const basePath = options?.baePath || "/api/auth";
		const fullURL = `${url}${basePath}/session`;
		const res = await betterFetch<{
			session: Session;
		}>(fullURL, {
			headers: request.headers,
		});
		if (!res.data) {
			return NextResponse.redirect(new URL(options.redirectTo, url));
		}
		return NextResponse.next();
	};
}

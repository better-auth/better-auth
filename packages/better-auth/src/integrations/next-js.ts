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
export async function authMiddleware<T extends Auth>(
	auth: T,
	options: {
		matcher: (request: NextRequest) =>
			| Array<{
					redirectTo: string;
					shouldRedirect: boolean;
			  }>
			| Promise<
					Array<{
						redirectTo: string;
						shouldRedirect: boolean;
					}>
			  >
			| {
					redirectTo: string;
					shouldRedirect: boolean;
			  }
			| Promise<{
					redirectTo: string;
					shouldRedirect: boolean;
			  }>;
	},
) {
	return async (request: NextRequest) => {
		let redirection = await options.matcher(request);
		if (!Array.isArray(redirection)) {
			redirection = [redirection];
		}
		for (const { shouldRedirect, redirectTo } of redirection) {
			console.log({ shouldRedirect, redirectTo });
			if (shouldRedirect) {
				const url = new URL(request.url).origin;
				const basePath = auth.options.basePath || "/api/auth";
				const fullURL = `${url}${basePath}/session`;
				const res = await betterFetch<{
					session: Session;
				}>(fullURL, {
					headers: request.headers,
				});

				if (!res.data?.session) {
					return NextResponse.redirect(new URL(redirectTo, request.url));
				}
			}
		}
		return NextResponse.next();
	};
}

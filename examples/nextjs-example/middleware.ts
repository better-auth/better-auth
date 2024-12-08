import { betterFetch } from "@better-fetch/fetch";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "./lib/auth-types";

export async function middleware(request: NextRequest) {
	const { data: session } = await betterFetch<Session>(
		"/api/auth/get-session",
		{
			baseURL: request.nextUrl.origin,
			headers: {
				//get the cookie from the request
				cookie: request.headers.get("cookie") || "",
			},
		},
	);

	if (!session) {
		return NextResponse.redirect(new URL("/", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard"],
};

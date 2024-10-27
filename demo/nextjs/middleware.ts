import { NextRequest, NextResponse } from "next/server";
import { client } from "./lib/auth-client";

export async function middleware(request: NextRequest) {
	// const { data: session } = await betterFetch<Session>(
	// 	"/api/auth/get-session",
	// 	{
	// 		baseURL: request.nextUrl.origin,
	// 		headers: {
	// 			//get the cookie from the request
	// 			cookie: request.headers.get("cookie") || "",
	// 		},
	// 	},
	// );
	const session = await client.getSession({
		fetchOptions: {
			headers: {
				cookie: request.headers.get("cookie") || "",
			},
		},
	});

	if (!session.data) {
		return NextResponse.redirect(new URL("/", request.url));
	}
	return NextResponse.next();
}

export const config = {
	matcher: ["/dashboard"],
};

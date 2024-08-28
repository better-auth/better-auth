import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authClient } from "./lib/auth-client";

export async function middleware(request: NextRequest) {
	const session = await authClient.session({
		options: {
			headers: request.headers,
		},
	});
	if (!session.data) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}
	const canInvite = await authClient.org.hasPermission({
		permission: {
			invitation: ["create"],
		},
		options: {
			headers: request.headers,
		},
	});
	console.log({ canInvite });
	return NextResponse.next();
}

export const config = {
	matcher: "/",
};

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
	const canInvite = await authClient.organization.hasPermission({
		permission: {
			invitation: ["create"],
		},
		options: {
			headers: request.headers,
		},
	});
	return NextResponse.next();
}

export const config = {
	matcher: "/",
};

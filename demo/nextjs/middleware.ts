import { authMiddleware } from "better-auth/next-js";
import { NextResponse } from "next/server";

export default authMiddleware({
	customRedirect: async (session, request) => {
		const baseURL = request.nextUrl.origin;
		if (request.nextUrl.pathname === "/sign-in" && session) {
			return NextResponse.redirect(new URL("/dashboard", baseURL));
		}
		if (request.nextUrl.pathname === "/dashboard" && !session) {
			return NextResponse.redirect(new URL("/sign-in", baseURL));
		}
		return NextResponse.next();
	},
});

export const config = {
	matcher: ["/dashboard", "/sign-in"],
};

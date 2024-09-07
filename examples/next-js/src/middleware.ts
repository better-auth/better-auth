import { authMiddleware } from "better-auth/next-js";
import { NextRequest } from "next/server";

export default async function middleware(request: NextRequest) {
	const res = await authMiddleware({
		redirectTo: "/sign-in",
	})(request);
}

export const config = {
	matcher: "/",
};

import { authMiddleware } from "better-auth/next-js";
import { NextRequest } from "next/server";

export default authMiddleware({
	redirectTo: "/sign-in",
});

export const config = {
	matcher: "/",
};

import { authMiddleware } from "better-auth/next-js";

export default authMiddleware({
	redirectTo: "/sign-in",
});

export const config = {
	matcher: "/",
};

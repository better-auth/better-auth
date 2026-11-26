import type { StartMiddleware } from "@solidjs/vite-plugin";
import { auth } from "./lib/auth";

const authMiddleware: StartMiddleware = (event, next) => {
	const { pathname } = new URL(event.request.url);
	if (pathname.startsWith("/api/auth")) {
		return auth.handler(event.request);
	}
	return next();
};

export default [authMiddleware];

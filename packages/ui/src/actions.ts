import type { AuthUIRoute, ServerUIAction } from "./types";

export function createRoute(options: {
	path: string;
	method?: "GET" | "POST" | undefined;
}): AuthUIRoute {
	return {
		type: "auth-route",
		path: options.path,
		method: options.method ?? "POST",
	};
}

const post = (path: string): AuthUIRoute =>
	createRoute({
		path,
		method: "POST",
	});

export const routes = {
	signIn: {
		email: post("/sign-in/email"),
		username: post("/sign-in/username"),
		social: post("/sign-in/social"),
		oauth2: post("/sign-in/oauth2"),
	},
	signUp: {
		email: post("/sign-up/email"),
	},
	signOut: post("/sign-out"),
	password: {
		requestReset: post("/request-password-reset"),
		reset: post("/reset-password"),
	},
	email: {
		sendVerification: post("/send-verification-email"),
	},
	sso: {
		register: post("/sso/register"),
	},
	username: {
		isAvailable: post("/is-username-available"),
	},
};

export function serverAction(id: string): ServerUIAction {
	return {
		type: "server-action",
		id,
		method: "POST",
	};
}

import { BetterAuthError } from "../error/better-auth-error";

function checkHasPath(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.pathname !== "/";
	} catch (error) {
		console.error("Invalid URL:", error);
		return false;
	}
}

function withPath(url: string, path = "/api/auth") {
	const hasPath = checkHasPath(url);
	if (hasPath) {
		return {
			baseURL: new URL(url).origin,
			withPath: url,
		};
	}
	path = path.startsWith("/") ? path : `/${path}`;
	return {
		baseURL: url,
		withPath: `${url}${path}`,
	};
}

export function getBaseURL(url?: string, path?: string, request?: Request) {
	if (url) {
		return withPath(url, path);
	}
	const env: any = typeof process !== "undefined" ? process.env : {};
	const fromEnv =
		env.BETTER_AUTH_URL ||
		env.AUTH_URL ||
		env.NEXT_PUBLIC_AUTH_URL ||
		env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		env.PUBLIC_AUTH_URL ||
		env.PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_AUTH_URL;
	if (fromEnv) {
		return withPath(fromEnv, path);
	}

	if (request) {
		return {
			baseURL: new URL(request.url).origin,
			withPath: new URL(request.url).origin + "/api/auth",
		};
	}
	return {
		baseURL: "",
		withPath: "/api/auth",
	};
}

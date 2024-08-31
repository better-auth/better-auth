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

export function getBaseURL(url?: string, path?: string) {
	if (url) {
		return withPath(url, path);
	}
	const env = typeof process !== "undefined" ? process.env : import.meta.env;
	const fromEnv =
		env.BETTER_AUTH_URL ||
		env.AUTH_URL ||
		env.NEXT_PUBLIC_AUTH_URL ||
		env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		env.PUBLIC_AUTH_URL ||
		env.PUBLIC_BETTER_AUTH_URL;
	if (fromEnv) {
		return withPath(fromEnv, path);
	}

	const isDev =
		!fromEnv && (env.NODE_ENV === "development" || env.NODE_ENV === "test");
	if (isDev) {
		return {
			baseURL: "http://localhost:3000",
			withPath: "http://localhost:3000/api/auth",
		};
	}
	throw new BetterAuthError(
		"Could not infer baseURL from environment variables",
	);
}

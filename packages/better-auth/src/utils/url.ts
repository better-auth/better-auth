import { env } from "../utils/env";
import { BetterAuthError } from "../error";

function checkHasPath(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.pathname !== "/";
	} catch (error) {
		throw new BetterAuthError(
			`Invalid base URL: ${url}. Please provide a valid base URL.`,
		);
	}
}

function withPath(url: string, path = "/api/auth") {
	const hasPath = checkHasPath(url);
	if (hasPath) {
		return url;
	}
	path = path.startsWith("/") ? path : `/${path}`;
	return `${url}${path}`;
}

export function getBaseURL(url?: string, path?: string) {
	if (url) {
		return withPath(url, path);
	}
	const fromEnv =
		env.BETTER_AUTH_URL ||
		env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		env.PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_AUTH_URL ||
		(env.BASE_URL !== "/" ? env.BASE_URL : undefined);

	if (fromEnv) {
		return withPath(fromEnv, path);
	}

	if (typeof window !== "undefined") {
		return withPath(window.location.origin, path);
	}
	return undefined;
}

export function getOrigin(url: string) {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin;
	} catch (error) {
		return null;
	}
}

export const checkURLValidity = (url: string) => {
	const urlPattern = url.includes("://");
	return urlPattern;
};

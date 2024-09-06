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
		return url;
	}
	path = path.startsWith("/") ? path : `/${path}`;
	return `${url}${path}`;
}

export function getBaseURL(url?: string, path?: string) {
	if (url) {
		return withPath(url, path);
	}
	const env: any = typeof process !== "undefined" ? process.env : {};
	const VENDOR_BASE_URLS =
		env.VERCEL_URL ||
		env.NEXT_PUBLIC_VERCEL_URL ||
		env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		env.PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_AUTH_URL ||
		env.AUTH_URL;
	const fromEnv =
		env.BETTER_AUTH_URL ||
		env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		env.PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_BETTER_AUTH_URL ||
		env.NUXT_PUBLIC_AUTH_URL ||
		VENDOR_BASE_URLS;
	if (fromEnv) {
		return withPath(fromEnv, path);
	}

	if (typeof window !== "undefined") {
		return withPath(window.location.origin, path);
	}

	return undefined;
}

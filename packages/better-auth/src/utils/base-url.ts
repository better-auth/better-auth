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
	const fromEnv =
		process.env.BETTER_AUTH_URL ||
		process.env.AUTH_URL ||
		process.env.NEXT_PUBLIC_AUTH_URL ||
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
	if (fromEnv) {
		return withPath(fromEnv, path);
	}
	if (
		!fromEnv &&
		(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
	) {
		return {
			baseURL: "http://localhost:3000",
			withPath: "http://localhost:3000/api/auth",
		};
	}
	throw new Error(
		"Could not infer baseURL from environment variables. Please pass it as an option to the createClient function.",
	);
}

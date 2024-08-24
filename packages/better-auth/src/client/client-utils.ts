export const HIDE_ON_CLIENT_METADATA = {
	onClient: "hide" as const,
};

function checkHasPath(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.pathname !== "/";
	} catch (error) {
		console.error("Invalid URL:", error);
		return false;
	}
}

function withPath(url: string) {
	const hasPath = checkHasPath(url);
	if (hasPath) {
		return url;
	}
	return `${url}/api/auth`;
}

export function getBaseURL(url?: string) {
	if (url) {
		return withPath(url);
	}
	const fromEnv =
		process.env.AUTH_URL ||
		process.env.NEXT_PUBLIC_AUTH_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
	if (fromEnv) {
		return withPath(fromEnv);
	}
	if (
		!fromEnv &&
		(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
	) {
		return "http://localhost:3000/api/auth";
	}
	throw new Error(
		"Could not infer baseURL from environment variables. Please pass it as an option to the createClient function.",
	);
}

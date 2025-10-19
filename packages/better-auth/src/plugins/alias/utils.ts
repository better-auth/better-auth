export const SPECIAL_ENDPOINTS = ["/sign-in/", "/sign-up/"] as const;

export type SpecialEndpoints = (typeof SPECIAL_ENDPOINTS)[number];

export function toCamelCase(path: string) {
	return path
		.replace(/[-_/](.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
		.replace(/^[A-Z]/, (match) => match.toLowerCase());
}

export function normalizePath(path: string) {
	if (path === "" || path === "/") {
		return "/";
	}
	return "/" + path.replace(/^\/+|\/+$/g, "");
}

export function normalizePrefix(prefix: string) {
	const cleanPrefix = normalizePath(prefix);
	return cleanPrefix !== "/" ? cleanPrefix : "";
}

export function resolvePath(url: string, baseURL?: string) {
	let resolvedPath: string;
	let base: URL | null = null;
	let basePath: string | null = null;

	if (/^https?:\/\//.test(url)) {
		resolvedPath = new URL(url).pathname;
	} else if (baseURL) {
		base = new URL(baseURL);
		basePath = normalizePath(base.pathname);
		const relative = url.replace(/^\/+/, "");
		const joined = [basePath, relative].filter((val) => !!val).join("/");
		resolvedPath = "/" + joined;
	} else {
		resolvedPath = url.startsWith("/") ? url : `/${url}`;
	}

	resolvedPath = normalizePath(resolvedPath);

	if (baseURL) {
		if (!base) {
			base = new URL(baseURL);
		}
		if (!basePath) {
			basePath = normalizePath(base.pathname);
		}
		if (basePath !== "/" && resolvedPath.startsWith(basePath)) {
			const stripped = resolvedPath.slice(basePath.length) || "/";

			resolvedPath = normalizePath(stripped);
		}
	}

	return { path: resolvedPath, basePath: basePath ?? "/api/auth" };
}

import type { HookEndpointContext } from "@better-auth/core";
import type { AuthEndpoint } from "../../api";

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
		// Absolute url, retrieving pathname
		resolvedPath = new URL(url).pathname;
	} else if (baseURL) {
		// Combine the base URL and relative URL, normalize
		// their paths, and get a consistent resolved path
		base = new URL(baseURL);
		basePath = normalizePath(base.pathname);
		const relative = url.replace(/^\/+/, "");
		const joined = [basePath, relative].filter((val) => !!val).join("/");
		resolvedPath = "/" + joined;
	} else {
		resolvedPath = url.startsWith("/") ? url : `/${url}`;
	}

	resolvedPath = normalizePath(resolvedPath);

	// Strip basePath prefix if present, keeping relative path only
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

export function updateMatcher<
	M extends
		| ((ctx: string) => boolean)
		| ((ctx: HookEndpointContext) => boolean),
>(
	cfg: {
		matcher: M;
		prefix: string;
	} & (
		| {
				excludeEndpoints?: string[];
				includeEndpoints?: never;
		  }
		| {
				includeEndpoints?: string[];
				excludeEndpoints?: never;
		  }
	),
) {
	return ((input: string | HookEndpointContext) => {
		const path = typeof input === "string" ? input : input.path;

		// flags for endpoint filtering
		const excluded = cfg.excludeEndpoints?.includes(path) ?? false;
		const included = cfg.includeEndpoints
			? cfg.includeEndpoints.includes(path)
			: true;

		let ctx: string | HookEndpointContext;

		// Only strip prefix if path starts with it and is not explicitly excluded
		if (path.startsWith(cfg.prefix) && !excluded) {
			const strippedPath = path.slice(cfg.prefix.length);
			ctx =
				typeof input === "string"
					? strippedPath
					: { ...input, path: strippedPath };
		} else if (excluded || !included) {
			// Keep original input for matcher if path is excluded or not included
			ctx = input;
		} else {
			// Path doesn't match prefix and is not explicitly included/excluded -> matcher should not run
			return false;
		}
		// @ts-expect-error
		return cfg.matcher(ctx);
	}) as M;
}

export function resolveURL(
	context: {
		url: string | URL;
		baseURL?: string;
	},
	specialEndpoints: string[],
	prefix?: string,
	mode: "exclude" | "include" = "exclude",
) {
	const { path, basePath } = resolvePath(
		context.url.toString(),
		context.baseURL,
	);

	// Check if current path matches any special endpoint
	const matches = specialEndpoints.some((ep) => {
		const normalized = normalizePath(ep);
		return path === normalized || path.startsWith(`${normalized}/`);
	});
	// skip transformation if path is in specialEndpoints based on mode
	if ((mode === "exclude" && matches) || (mode === "include" && !matches)) {
		return context.url.toString();
	}

	// Prepend prefix if provided
	const relativePath = `${prefix || ""}${path}`;
	if (typeof context.url !== "string") {
		// Construct full URL from basePath and relativePath
		const res = new URL(`${basePath}${relativePath}`, context.url).toString();
		return res;
	}

	return relativePath;
}

export function cloneEndpoint<
	T extends ((...args: any[]) => any) & Record<string, any>,
>(endpoint: T, path: string): Omit<AuthEndpoint, "wrap"> {
	const cloned = ((...args: Parameters<T>) => endpoint(...args)) as T &
		Record<string, any>;

	return Object.assign(cloned, {
		path,
		// Preserve original path
		originalPath: endpoint.originalPath || endpoint.path,
		options: endpoint.options,
	});
}

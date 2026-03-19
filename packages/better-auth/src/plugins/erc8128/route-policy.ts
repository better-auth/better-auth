import type { DiscoveryDocumentConfig, RoutePolicy } from "@slicekit/erc8128";

export type RoutePolicyConfig = DiscoveryDocumentConfig["routePolicy"];
type NormalizedRoutePolicyConfig = NonNullable<RoutePolicyConfig>;

export type ResolvedRoutePolicy =
	| {
			policy?: RoutePolicy;
			requireAuth: false;
			skipVerification: false;
	  }
	| {
			policy: RoutePolicy;
			requireAuth: true;
			skipVerification: false;
	  }
	| {
			policy?: RoutePolicy;
			requireAuth: false;
			skipVerification: true;
	  };

const pluginPaths = [
	"/erc8128/verify",
	"/erc8128/invalidate",
	"/.well-known/erc8128",
];

function normalizeBasePath(baseURL?: string) {
	if (!baseURL) {
		return "/";
	}
	try {
		const pathname = new URL(baseURL).pathname.replace(/\/+$/, "") || "/";
		return pathname;
	} catch {
		return "/";
	}
}

function normalizeConfiguredPath(path: string, baseURL?: string) {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const basePath = normalizeBasePath(baseURL);

	if (basePath === "/" || basePath === "") {
		return normalizedPath;
	}

	if (normalizedPath === basePath) {
		return "/";
	}

	if (normalizedPath.startsWith(`${basePath}/`)) {
		return normalizedPath.slice(basePath.length) || "/";
	}

	return normalizedPath;
}

export function getRoutePolicyPathname(
	requestOrUrl: Request | string,
	baseURL?: string,
) {
	const requestUrl =
		typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.url;
	let pathname: string;

	try {
		pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/";
	} catch {
		return "/";
	}

	const basePath = normalizeBasePath(baseURL);
	if (basePath === "/" || basePath === "") {
		return pathname;
	}

	if (pathname === basePath) {
		return "/";
	}

	if (pathname.startsWith(`${basePath}/`)) {
		return pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
	}

	return pathname;
}

export function normalizeRoutePolicyConfig(
	routePolicy: NormalizedRoutePolicyConfig,
	baseURL?: string,
): NormalizedRoutePolicyConfig {
	const normalized = {} as NormalizedRoutePolicyConfig;

	for (const [path, policy] of Object.entries(routePolicy)) {
		if (path === "default") {
			normalized.default = policy as RoutePolicy;
			continue;
		}
		normalized[normalizeConfiguredPath(path, baseURL)] = policy;
	}

	return normalized;
}

export function isPluginEndpoint(request: Request, baseURL?: string) {
	const pathname = new URL(request.url).pathname;
	const relativePath = getRoutePolicyPathname(request, baseURL);

	return pluginPaths.some(
		(p) => pathname.endsWith(p) || relativePath.endsWith(p),
	);
}

function resolvePathPolicy(
	method: string,
	policy: RoutePolicy | RoutePolicy[] | false | undefined,
): RoutePolicy | false | undefined {
	if (policy === false || !policy) {
		return policy;
	}

	const candidates = Array.isArray(policy) ? policy : [policy];
	let fallback: RoutePolicy | undefined;

	for (const candidate of candidates) {
		const methods = candidate.methods;
		if (!methods || methods.length === 0) {
			fallback ??= candidate;
			continue;
		}
		if (methods.some((entry) => entry.toUpperCase() === method)) {
			return candidate;
		}
	}

	return fallback;
}

export function resolveRoutePolicy(
	routePolicy: RoutePolicyConfig,
	request: Request,
	baseURL?: string,
): ResolvedRoutePolicy {
	if (!routePolicy) {
		return { requireAuth: false, skipVerification: false };
	}

	const method = request.method.toUpperCase();
	const pathname = getRoutePolicyPathname(request, baseURL);
	const normalizedRoutePolicy = normalizeRoutePolicyConfig(
		routePolicy,
		baseURL,
	);
	const exactPolicy = Object.prototype.hasOwnProperty.call(
		normalizedRoutePolicy,
		pathname,
	)
		? resolvePathPolicy(method, normalizedRoutePolicy[pathname])
		: undefined;

	if (Object.prototype.hasOwnProperty.call(normalizedRoutePolicy, pathname)) {
		if (exactPolicy === false) {
			return { requireAuth: false, skipVerification: true };
		}
		if (exactPolicy) {
			return {
				policy: exactPolicy,
				requireAuth: true,
				skipVerification: false,
			};
		}
		return { requireAuth: false, skipVerification: false };
	}

	let bestWildcard:
		| {
				path: string;
				policy: RoutePolicy | false | undefined;
		  }
		| undefined;

	for (const [path, candidate] of Object.entries(normalizedRoutePolicy)) {
		if (path === "default" || !path.endsWith("/*")) {
			continue;
		}

		const prefix = path.slice(0, -1);
		if (!pathname.startsWith(prefix)) {
			continue;
		}

		if (!bestWildcard || prefix.length > bestWildcard.path.length) {
			bestWildcard = {
				path: prefix,
				policy: resolvePathPolicy(method, candidate),
			};
		}
	}

	if (bestWildcard) {
		if (bestWildcard.policy === false) {
			return { requireAuth: false, skipVerification: true };
		}
		if (bestWildcard.policy) {
			return {
				policy: bestWildcard.policy,
				requireAuth: true,
				skipVerification: false,
			};
		}
		return { requireAuth: false, skipVerification: false };
	}

	if (normalizedRoutePolicy.default) {
		const defaultPolicy = resolvePathPolicy(
			method,
			normalizedRoutePolicy.default,
		);
		if (!defaultPolicy) {
			return { requireAuth: false, skipVerification: false };
		}
		return {
			policy: defaultPolicy,
			requireAuth: true,
			skipVerification: false,
		};
	}

	return { requireAuth: false, skipVerification: false };
}

export function resolveRequestRoutePolicy(
	routePolicy: RoutePolicyConfig,
	request: Request,
	baseURL?: string,
): RoutePolicy | undefined {
	return resolveRoutePolicy(routePolicy, request, baseURL).policy;
}

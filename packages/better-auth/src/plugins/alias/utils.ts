export const SPECIAL_ENDPOINTS = ["/sign-in/", "/sign-up/"] as const;

export type SpecialEndpoints = (typeof SPECIAL_ENDPOINTS)[number];

export function toCamelCase(path: string) {
	return path
		.replace(/[-_/](.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
		.replace(/^[A-Z]/, (match) => match.toLowerCase());
}

export function normalizePrefix(prefix: string) {
	const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
	const cleanPrefix = normalizedPrefix.endsWith("/")
		? normalizedPrefix.slice(0, -1)
		: normalizedPrefix;

	return cleanPrefix;
}

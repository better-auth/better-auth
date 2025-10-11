export const SPECIAL_ENDPOINTS = ["/sign-in/", "/sign-up/"] as const;

export function toCamelCase(path: string) {
	return path
		.replace(/[-_/](.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
		.replace(/^[A-Z]/, (match) => match.toLowerCase());
}

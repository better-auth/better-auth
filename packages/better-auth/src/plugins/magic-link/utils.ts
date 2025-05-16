export function redirectErrorURL(url: string, error: string) {
	return `${url}${url.includes("?") ? "&" : "?"}error=${error}`;
}

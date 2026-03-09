export function isBrowserFetchRequest(headers?: Headers | null): boolean {
	return headers?.get("sec-fetch-mode") === "cors";
}

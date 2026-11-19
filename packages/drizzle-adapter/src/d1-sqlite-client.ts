/**
 * Cloudflare D1 exposes `batch`, `prepare`, and `exec`. Drizzle's D1 client
 * keeps that handle on `$client`. Detection must not throw on lazy database
 * proxies that reject property access.
 */
export function isD1SqliteClient(db: unknown): boolean {
	if (!db || typeof db !== "object") return false;
	if (hasD1Methods(db)) return true;
	if (!("$client" in db)) return false;
	try {
		return hasD1Methods((db as { $client: unknown }).$client);
	} catch {
		return false;
	}
}

function hasD1Methods(value: unknown): boolean {
	return (
		!!value &&
		typeof value === "object" &&
		"batch" in value &&
		"prepare" in value &&
		"exec" in value
	);
}

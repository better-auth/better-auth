/**
 * Cloudflare D1 exposes `batch`, `prepare`, and `exec`. Drizzle's D1 client
 * keeps that handle on `$client`. Detection must not throw on lazy database
 * proxies that reject property access.
 */
export function isD1SqliteClient(db: unknown): boolean {
	if (!db || typeof db !== "object") return false;
	try {
		if (hasD1Methods(db)) return true;
		if (!("$client" in db)) return false;
		return hasD1Methods((db as { $client: unknown }).$client);
	} catch {
		return false;
	}
}

function hasD1Methods(value: unknown): boolean {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as { batch?: unknown }).batch === "function" &&
		typeof (value as { prepare?: unknown }).prepare === "function" &&
		typeof (value as { exec?: unknown }).exec === "function"
	);
}

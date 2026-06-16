import { memoryAdapter } from "better-auth/adapters/memory";

// A plain object (not a Proxy): the memory adapter's transaction support
// snapshots the database with `structuredClone`, which cannot clone a Proxy.
// Each model used by the configured plugins must be seeded with an empty array
// so reads before the first write don't throw "Model not found".
export const database = memoryAdapter({
	user: [],
	session: [],
	account: [],
	verification: [],
	twoFactor: [],
	passkey: [],
});

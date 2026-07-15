import type { D1Database } from "@cloudflare/workers-types";

const d1DatabaseByKysely = new WeakMap<object, D1Database>();

export function getD1Database(database: unknown): D1Database | undefined {
	if (
		database === null ||
		typeof database !== "object" ||
		!("batch" in database) ||
		typeof database.batch !== "function" ||
		!("exec" in database) ||
		typeof database.exec !== "function" ||
		!("prepare" in database) ||
		typeof database.prepare !== "function"
	) {
		return undefined;
	}
	return database as D1Database;
}

export function registerKyselyD1Database(
	database: object,
	d1Database: D1Database,
): void {
	d1DatabaseByKysely.set(database, d1Database);
}

export function getKyselyD1Database(database: object): D1Database | undefined {
	return d1DatabaseByKysely.get(database);
}

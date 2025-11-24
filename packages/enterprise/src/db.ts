import * as generatedTables from "./db-schema.generated";

const schema = {
	...generatedTables,
};

export const databaseSchema = schema;

let drizzle: typeof import("drizzle-orm/node-postgres").drizzle;

if (process.env.BUN) {
	drizzle = require("drizzle-orm/bun-sql").drizzle;
} else {
	drizzle = require("drizzle-orm/node-postgres").drizzle;
}

export const db = drizzle(
	process.env.DATABASE_URL! + "?options=-c search_path=enterprise",
	{ schema },
);

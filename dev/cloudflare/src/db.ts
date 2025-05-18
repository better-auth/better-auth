import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";
import postgres from "postgres";
import { drizzle as DrizzlePG } from "drizzle-orm/postgres-js";

export const createDrizzle = (db: D1Database) => drizzle(db, { schema });

export const client = postgres(
	"postgresql://username:password@localhost:5432/mydatabase",
	{ prepare: false },
);
export const db = DrizzlePG(client, {
	casing: "snake_case",
	schema: { ...schema },
});

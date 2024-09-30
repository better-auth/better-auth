import { drizzle } from "drizzle-orm/postgres-js";
import {
	pgTable,
	serial,
	varchar,
	text,
	timestamp,
	integer,
	boolean,
} from "drizzle-orm/pg-core";
import postgres from "postgres";

const table = pgTable("test", {
	id: text("id").primaryKey(),
});

const schema = {
	table,
};

export const client = postgres(process.env.POSTGRES_URL || "");
export const db = drizzle(client, { schema });

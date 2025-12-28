import { drizzle } from "drizzle-orm/node-postgres";
import * as generatedTables from "./db-schema.generated";

export const schema = {
	...generatedTables,
};

export * from "drizzle-orm/node-postgres";

export const connection = (url: string) =>
	drizzle(url + "?options=-c search_path=enterprise", { schema });

export type Connection = ReturnType<typeof connection>;

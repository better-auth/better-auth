import { fileURLToPath } from "node:url";

export type Dialect = "sqlite" | "postgresql" | "mysql";

export const DATABASE_URLS: Record<Dialect, string> = {
	sqlite: `file:${fileURLToPath(new URL("./dev.db", import.meta.url))}`,
	postgresql: "postgres://user:password@localhost:5434/better_auth",
	mysql: "mysql://user:password@localhost:3308/better_auth",
};

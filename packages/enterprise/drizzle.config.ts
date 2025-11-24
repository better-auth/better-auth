import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db-schema.final.ts",
	driver: "pglite",
	dbCredentials: {
		url: process.env.DATABASE_URL! + "?options=-c search_path=enterprise",
	},
	migrations: {
		table: "_migrations", // `__drizzle_migrations` by default
		schema: "enterprise", // used in PostgreSQL only, `drizzle` by default
	},
});

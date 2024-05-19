import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
export const user = sqliteTable("user", {
	id: text("id").primaryKey().default(new Date().toISOString()),
	email: text("email").unique(),
	name: text("name"),
	emailVerified: int("emailVerified", {
		mode: "boolean",
	}),
	password: text("password"),
});

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";

const sqlite = new Database("./sqlite.db");

export const createTables = () => {
	sqlite.exec(`CREATE TABLE user (
        id TEXT PRIMARY KEY DEFAULT (datetime('now')),
        email TEXT UNIQUE,
        name TEXT,
        emailVerified INTEGER DEFAULT 0 CHECK (emailVerified IN (0, 1)),
        password TEXT
    );`);
};

export const db = drizzle(sqlite, {
	schema: { user },
});

export const deleteDb = () => {
	sqlite.exec("DROP TABLE user");
	sqlite.close();
	//remove the file
	fs.unlinkSync("sqlite.db");
};

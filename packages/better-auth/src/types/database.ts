import type Database from "better-sqlite3";
import type { Pool } from "mysql2";

export type BetterSqlite3Database = Database.Database;
export type MysqlPool = Pool;

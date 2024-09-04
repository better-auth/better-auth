import { type SQLJsDatabase, drizzle } from "drizzle-orm/sql-js";
import initSqlJs, { SqlValue } from "sql.js";
import fs from "node:fs";
import path from "node:path";

import { migrate } from "drizzle-orm/sql-js/migrator";

export let db: SQLJsDatabase;

const run = async () => {
  const filebuffer = fs.readFileSync(
    path.resolve(".", "public/database.sqlite"),
  );
  const SQL = await initSqlJs();
  const sqldb = new SQL.Database(filebuffer);
  const database = drizzle(sqldb);
  db = database;

  migrate(db, { migrationsFolder: path.resolve(".", "db/migrations") });

  const data = sqldb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(path.resolve(".", "public/database.sqlite"), buffer);
};
run().catch(console.log);

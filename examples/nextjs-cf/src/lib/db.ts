import { getRequestContext } from "@cloudflare/next-on-pages";
import { D1Dialect } from "kysely-d1";
import { Kysely } from "kysely";

function initDbConnection() {
  if (process.env.NODE_ENV === "development") {
    const { env } = getRequestContext();
    return new D1Dialect({
      database: (env as { DB: D1Database }).DB,
    });
  }
  return new D1Dialect({
    database: process.env.DB,
  });
}

export const db = new Kysely({
  dialect: initDbConnection(),
});

import { D1Database } from "@cloudflare/workers-types";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB: D1Database;
      BETTER_AUTH_URL: string;
    }
  }
}

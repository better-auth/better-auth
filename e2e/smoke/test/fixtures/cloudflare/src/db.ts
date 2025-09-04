import { drizzle } from "drizzle-orm/d1";
import * as schema from "./auth-schema";

export const createDrizzle = (db: D1Database) => drizzle(db, { schema });

export { generateDrizzleSchema } from "./generators/drizzle";
export { generatePrismaSchema } from "./generators/prisma";
export { generateKyselySchema } from "./generators/kysely";
export { generateSchema, adapters } from "./generators";
export type { SchemaGenerator, SchemaGeneratorResult } from "./generators/types";
export type { DBAdapter } from "@better-auth/core/db/adapter";

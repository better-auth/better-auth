export type { DBAdapter } from "@better-auth/core/db/adapter";
export { adapters, generateSchema } from "./generators";
export { generateDrizzleSchema } from "./generators/drizzle";
export { generateKyselySchema } from "./generators/kysely";
export { generatePrismaSchema } from "./generators/prisma";
export type {
	SchemaGenerator,
	SchemaGeneratorResult,
} from "./generators/types";

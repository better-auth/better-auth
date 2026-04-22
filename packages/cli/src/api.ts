export type { DBAdapter } from "@better-auth/core/db/adapter";
export { generateDrizzleSchema } from "./generators/drizzle.js";
export { adapters, generateSchema } from "./generators/index.js";
export { generateKyselySchema } from "./generators/kysely.js";
export { generatePrismaSchema } from "./generators/prisma.js";
export type {
	SchemaGenerator,
	SchemaGeneratorResult,
} from "./generators/types.js";

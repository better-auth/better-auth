import { createD1Profile } from "@better-auth/kysely-adapter";
import type { BetterAuthOptions } from "better-auth";

declare const database: Parameters<typeof createD1Profile>[0];

/** @see https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html */
export const options: BetterAuthOptions = {
	database: createD1Profile(database),
};

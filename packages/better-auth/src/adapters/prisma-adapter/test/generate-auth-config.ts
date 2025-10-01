import fs from "fs/promises";
import type { BetterAuthOptions } from "../../../types";
import path from "path";

export const generateAuthConfigFile = async (_options: BetterAuthOptions) => {
	const options = { ..._options };
	// biome-ignore lint/performance/noDelete: perf doesn't matter here.
	delete options.database;
	let code = `import { betterAuth } from "../../../auth";
import { prismaAdapter } from "../prisma-adapter";		
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

export const auth = betterAuth({
    database: prismaAdapter(db, {
	    provider: 'sqlite'
    }),
    ${JSON.stringify(options, null, 2).slice(1, -1)}
})`;

	await fs.writeFile(path.join(import.meta.dirname, "auth.ts"), code);
};

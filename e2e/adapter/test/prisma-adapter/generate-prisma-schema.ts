import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import type { Dialect } from "./constants";

export async function generatePrismaSchema(
	betterAuthOptions: BetterAuthOptions,
	db: PrismaClient,
	iteration: number,
	dialect: Dialect,
) {
	const i = async (x: string) => await import(x);
	const { generateSchema } = (await i(
		join(
			import.meta.dirname,
			"./../../../../packages/cli/src/generators/index",
		),
	)) as {
		generateSchema: (opts: {
			adapter: DBAdapter<BetterAuthOptions>;
			file?: string;
			options: BetterAuthOptions;
		}) => Promise<{
			code: string | undefined;
			fileName: string;
			overwrite: boolean | undefined;
		}>;
	};

	const prismaDB = prismaAdapter(db, { provider: dialect });
	let { fileName, code } = await generateSchema({
		file: join(import.meta.dirname, `schema-${dialect}.prisma`),
		adapter: prismaDB({}),
		options: { ...betterAuthOptions, database: prismaDB },
	});

	// The CLI may not detect Prisma v7 if process.cwd() doesn't have prisma
	// in its package.json (e.g. monorepo root). Ensure the schema uses the v7
	// format: "prisma-client" provider, no url in datasource, and custom output.
	code = code
		?.replace('provider = "prisma-client-js"', 'provider = "prisma-client"')
		.replace(/\s*url\s*=\s*(?:env\([^)]*\)|"[^"]*")\n?/g, "\n")
		.split("\n")
		.map((line, index) => {
			if (index === 2) {
				return (
					line + `\n  output   = "./.tmp/prisma-client-${dialect}-${iteration}"`
				);
			}
			return line;
		})
		.join("\n");
	await fs.writeFile(fileName, code || "", "utf-8");
}

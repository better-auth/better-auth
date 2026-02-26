import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";

export async function generatePrismaSchema(
	betterAuthOptions: BetterAuthOptions,
	db: PrismaClient,
	iteration: number,
	dialect: "sqlite" | "postgresql" | "mysql",
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

	// The CLI generates schemas with "prisma-client" provider for v7, but that
	// produces .ts files which can't be dynamically imported by Node.js ESM.
	// Switch to "prisma-client-js" which produces .js files with a proper index.js
	// entry point, and inject the output path for the generated Prisma client.
	code = code
		?.replace('provider = "prisma-client"', 'provider = "prisma-client-js"')
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

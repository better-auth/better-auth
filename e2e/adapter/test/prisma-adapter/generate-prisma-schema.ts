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

	// In Prisma v7, remove the url property from the datasource
	// The connection is now handled via adapter in PrismaClient constructor
	code = code?.replace(/url\s*=\s*(env\([^)]+\)|"[^"]*")\n?/g, "");

	code = code
		?.split("\n")
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

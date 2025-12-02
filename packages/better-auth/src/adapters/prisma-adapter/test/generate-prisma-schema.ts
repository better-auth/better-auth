import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "../prisma-adapter";

export async function generatePrismaSchema(
	betterAuthOptions: BetterAuthOptions,
	db: PrismaClient,
	iteration: number,
	dialect: "sqlite" | "postgresql" | "mysql",
) {
	const i = async (x: string) => await import(x);
	const { generateSchema } = (await i(
		join(import.meta.dirname, "./../../../../../cli/src/generators/index"),
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
	if (dialect === "postgresql") {
		code = code?.replace(
			`env("DATABASE_URL")`,
			'"postgres://user:password@localhost:5434/better_auth"',
		);
	} else if (dialect === "mysql") {
		code = code?.replace(
			`env("DATABASE_URL")`,
			'"mysql://user:password@localhost:3308/better_auth"',
		);
	}
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

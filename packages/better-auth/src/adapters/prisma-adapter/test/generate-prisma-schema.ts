import type { PrismaClient } from "@prisma/client";
import type { Adapter, BetterAuthOptions } from "../../../types";
import { prismaAdapter } from "../prisma-adapter";
import { join } from "path";
import fs from "fs/promises";

export async function generatePrismaSchema(
	betterAuthOptions: BetterAuthOptions,
	db: PrismaClient,
	iteration: number,
) {
	const i = async (x: string) => await import(x);
	const { generateSchema } = (await i(
		"./../../../../../cli/src/generators/index",
	)) as {
		generateSchema: (opts: {
			adapter: Adapter;
			file?: string;
			options: BetterAuthOptions;
		}) => Promise<{
			code: string | undefined;
			fileName: string;
			overwrite: boolean | undefined;
		}>;
	};
	const prismaDB = prismaAdapter(db, { provider: "sqlite" });
	let { fileName, code } = await generateSchema({
		file: join(import.meta.dirname, "schema.prisma"),
		adapter: prismaDB({}),
		options: { ...betterAuthOptions, database: prismaDB },
	});
	code = code?.replace(`@map("email")`, "")
	//../../../../
	code = code?.split('\n').map((line, index) => {
		if (index === 2) {
			return line + `\n  output   = "./.tmp/prisma-client-${iteration}"`;
		}
		return line;
	}).join('\n');
	// console.log(code)
	await fs.writeFile(fileName, code || "", "utf-8");
}

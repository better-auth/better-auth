import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { drizzleAdapter } from "../drizzle-adapter";

let generationCount = 0;

const schemaCache = new Map<string, { count: number; schema: any }>();

/**
 * generates a drizzle schema based on BetterAuthOptions & a given dialect.
 *
 * Useful for testing the Drizzle adapter.
 */
export const generateDrizzleSchema = async (
	db: any,
	options: BetterAuthOptions,
	dialect: "sqlite" | "mysql" | "pg",
) => {
	const cacheKey = `${dialect}-${JSON.stringify(options)}`;
	if (schemaCache.has(cacheKey)) {
		const { count, schema } = schemaCache.get(cacheKey)!;
		return {
			schema,
			fileName: `./.tmp/generated-${dialect}-schema-${count}`,
		};
	}
	generationCount++;
	let thisCount = generationCount;
	const i = async (x: string) => {
		// Clear the Node.js module cache for the generated schema file to ensure fresh import
		try {
			const resolvedPath =
				require?.resolve?.(x) ||
				(import.meta && new URL(x, import.meta.url).pathname);
			if (resolvedPath && typeof resolvedPath === "string" && require?.cache) {
				delete require.cache[resolvedPath];
			}
		} catch (error) {}
		return await import(x);
	};

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

	const exists = await fs
		.access(join(import.meta.dirname, `/.tmp`))
		.then(() => true)
		.catch(() => false);
	if (!exists) {
		await fs.mkdir(join(import.meta.dirname, `/.tmp`), { recursive: true });
	}

	let adapter = drizzleAdapter(db, { provider: dialect })(options);

	let { code } = await generateSchema({
		adapter,
		options,
	});

	await fs.writeFile(
		join(
			import.meta.dirname,
			`/.tmp/generated-${dialect}-schema-${thisCount}.ts`,
		),
		code || "",
		"utf-8",
	);

	const res = await i(`./.tmp/generated-${dialect}-schema-${thisCount}`);
	schemaCache.set(cacheKey, {
		count: thisCount,
		schema: res,
	});
	return {
		schema: res,
		fileName: `./.tmp/generated-${dialect}-schema-${thisCount}`,
	};
};

export const clearSchemaCache = () => {
	schemaCache.clear();
};

export const resetGenerationCount = () => {
	generationCount = 0;
};

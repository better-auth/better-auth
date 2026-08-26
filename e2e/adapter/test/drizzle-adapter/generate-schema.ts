import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { DB, DrizzleAdapterConfig } from "@better-auth/drizzle-adapter";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

let generationCount = 0;
let generationNamespace = randomUUID();

type GeneratedDrizzleSchema = Record<string, unknown>;

const schemaCache = new Map<
	string,
	{ fileName: string; schema: GeneratedDrizzleSchema }
>();

/**
 * generates a drizzle schema based on BetterAuthOptions & a given dialect.
 *
 * Useful for testing the Drizzle adapter.
 */
export const generateDrizzleSchema = async (
	db: DB,
	options: BetterAuthOptions,
	dialect: "sqlite" | "mysql" | "pg",
	adapterConfig?: Pick<DrizzleAdapterConfig, "camelCase">,
) => {
	const cacheKey = `${dialect}-${JSON.stringify(options)}-${JSON.stringify(adapterConfig)}`;
	if (schemaCache.has(cacheKey)) {
		const { fileName, schema } = schemaCache.get(cacheKey)!;
		return {
			schema,
			fileName,
		};
	}
	generationCount++;
	const thisCount = generationCount;
	const fileName = `./.tmp/generated-${dialect}-schema-${generationNamespace}-${thisCount}`;
	const i = async (x: string) => {
		// Clear the Node.js module cache for the generated schema file to ensure fresh import
		try {
			const resolvedPath =
				require?.resolve?.(x) ||
				(import.meta && new URL(x, import.meta.url).pathname);
			if (resolvedPath && typeof resolvedPath === "string" && require?.cache) {
				delete require.cache[resolvedPath];
			}
		} catch {}
		return await import(x);
	};

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

	const exists = await fs
		.access(join(import.meta.dirname, `/.tmp`))
		.then(() => true)
		.catch(() => false);
	if (!exists) {
		await fs.mkdir(join(import.meta.dirname, `/.tmp`), { recursive: true });
	}

	const adapter = drizzleAdapter(db, {
		provider: dialect,
		...adapterConfig,
	})(options);

	const { code } = await generateSchema({
		adapter,
		options,
	});

	await fs.writeFile(
		join(import.meta.dirname, `${fileName}.ts`),
		code || "",
		"utf-8",
	);

	const res = (await i(fileName)) as GeneratedDrizzleSchema;
	schemaCache.set(cacheKey, {
		fileName,
		schema: res,
	});
	return {
		schema: res,
		fileName,
	};
};

export const clearSchemaCache = () => {
	schemaCache.clear();
};

export const resetGenerationCount = () => {
	generationCount = 0;
	generationNamespace = randomUUID();
};

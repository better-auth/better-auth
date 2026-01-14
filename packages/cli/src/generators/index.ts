import { generateDrizzleSchema } from "./drizzle";
import { generateKyselySchema } from "./kysely";
import { generatePrismaSchema } from "./prisma";
import type { SchemaGeneratorOptions } from "./types";

export const adapters = {
	prisma: generatePrismaSchema,
	drizzle: generateDrizzleSchema,
	kysely: generateKyselySchema,
};

export const generateSchema = (opts: SchemaGeneratorOptions) => {
	const adapter = opts.adapter;
	const generator =
		adapter.id in adapters
			? adapters[adapter.id as keyof typeof adapters]
			: null;
	if (generator) {
		// generator from the built-in list above
		return generator(opts);
	}
	if (adapter.createSchema) {
		// use the custom adapter's createSchema method
		return adapter
			.createSchema(opts.options, opts.file)
			.then(({ code, path: fileName, overwrite }) => ({
				code,
				fileName,
				overwrite,
			}));
	}

	throw new Error(
		`${adapter.id} is not supported. If it is a custom adapter, please request the maintainer to implement createSchema`,
	);
};

import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { generateDrizzleSchema } from "./drizzle";
import { generateKyselySchema } from "./kysely";
import { generatePrismaSchema } from "./prisma";

export const adapters = {
	prisma: generatePrismaSchema,
	drizzle: generateDrizzleSchema,
	kysely: generateKyselySchema,
};

export const generateSchema = async (opts: {
	adapter: DBAdapter;
	file?: string;
	options: BetterAuthOptions;
}) => {
	const adapter = opts.adapter;

	// use the custom adapter's createSchema method if it exists
	if (adapter.createSchema) {
		return adapter
			.createSchema(opts.options, opts.file)
			.then(({ code, path: fileName, overwrite }) => ({
				code,
				fileName,
				overwrite,
			}));
	}

	const generator =
		adapter.id in adapters
			? adapters[adapter.id as keyof typeof adapters]
			: null;
	if (generator) {
		// generator from the built-in list above
		return await generator(opts);
	}

	throw new Error(
		`${adapter.id} is not supported. If it is a custom adapter, please request the maintainer to implement createSchema`,
	);
};

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

export const generateSchema = (opts: {
	adapter: DBAdapter;
	file?: string;
	options: BetterAuthOptions;
	/**
	 * Force schema generation by treating the database as empty.
	 * When true, all tables will be included as if they don't exist.
	 */
	force?: boolean;
}) => {
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

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

	// Adapter-provided createSchema takes priority over built-in generators.
	// This allows adapters that share an id (e.g. the relations-v2 drizzle
	// adapter uses id "drizzle") to override the built-in schema generator
	// with their own version.
	if (adapter.createSchema) {
		return adapter
			.createSchema(opts.options, opts.file)
			.then(({ code, path: fileName, overwrite }) => ({
				code,
				fileName,
				overwrite,
			}));
	}

	const generator = adapters[adapter.id as keyof typeof adapters] ?? null;
	if (generator) {
		return await generator(opts);
	}

	throw new Error(
		`${adapter.id} is not supported. If it is a custom adapter, please request the maintainer to implement the "createSchema" method on the adapter.`,
	);
};

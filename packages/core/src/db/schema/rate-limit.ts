import type { DBRequiredTable, InferDBType } from "../type";
import { coreSchema, field, schema } from "./shared";

export const rateLimitSchema = {
	fields: {
		key: field("string"),
		count: field("number"),
		lastRequest: field("number", { bigint: true }),

		...coreSchema,
	},
	modelName: "rateLimit",
};

export type RateLimit<S extends DBRequiredTable<"ratelimit"> = typeof schema> =
	InferDBType<S["ratelimit"]>;

import type { DBRequiredTable, InferDBType } from "../type";
import { coreSchema, field, schema } from "./shared";

export const sessionSchema = {
	fields: {
		userId: field("string"),
		expiresAt: field("date"),
		token: field("string"),
		ipAddress: field("string", { required: false }),
		userAgent: field("string", { required: false }),

		...coreSchema,
	},
	modelName: "session",
};

export type Session<S extends DBRequiredTable<"session"> = typeof schema> =
	InferDBType<S["session"]>;

import type { DBRequiredTable, InferDBType } from "../type";
import { coreSchema, field, schema } from "./shared";

export const verificationSchema = {
	fields: {
		value: field("string"),
		expiresAt: field("date"),
		identifier: field("string"),

		...coreSchema,
	},
	modelName: "verification",
};

export type Verification<
	S extends DBRequiredTable<"verification"> = typeof schema,
> = InferDBType<S["verification"]>;

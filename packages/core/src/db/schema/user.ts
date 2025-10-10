import type { DBRequiredTable, InferDBType } from "../type";
import { coreSchema, field, schema } from "./shared";

export const userSchema = {
	fields: {
		email: field("string", {
			transform: { input: (val) => val.toLowerCase() },
		}),
		emailVerified: field("boolean", { defaultValue: false }),
		name: field("string"),
		image: field("string", { required: false }),

		...coreSchema,
	},
	modelName: "user",
};

export type User<S extends DBRequiredTable<"user"> = typeof schema> =
	InferDBType<S["user"]>;

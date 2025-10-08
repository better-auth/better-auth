import { field } from "../../db";
import { type AuthPluginSchema } from "../../types";

export const schema = {
	user: {
		fields: {
			role: field("string", {
				required: false,
				input: false,
			}),
			banned: field("boolean", {
				defaultValue: false,
				required: false,
				input: false,
			}),
			banReason: field("string", {
				required: false,
				input: false,
			}),
			banExpires: field("date", {
				required: false,
				input: false,
			}),
		},
	},
	session: {
		fields: {
			impersonatedBy: field("string", {
				required: false,
			}),
		},
	},
} satisfies AuthPluginSchema;

export type AdminSchema = typeof schema;

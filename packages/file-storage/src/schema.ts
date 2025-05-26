import type { AuthPluginSchema } from "better-auth";

export const schema = {
	files: {
		fields: {
			userId: {
				type: "string",
				required: true as boolean,
				input: true,
			},
			name: {
				type: "string",
				required: true,
				input: true,
			},
			type: {
				type: "string",
				required: true,
				input: true,
			},
			size: {
				type: "number",
				required: true,
				input: true,
			},
			url: {
				type: "string",
				required: true,
				input: true,
			},
			createdAt: {
				type: "date",
				required: true,
				input: true,
				defaultValue: () => new Date(),
			},
		},
	},
} satisfies AuthPluginSchema;

export type FileStorageEntry = {
	id: string;
	userId: string;
	name: string;
	type: string;
	size: number;
	url: string;
	createdAt: Date;
};

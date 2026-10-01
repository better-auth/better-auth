import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";

export const getSchema = <IncludeDisplayUsername extends boolean = true>(
	normalizer: {
		username: (username: string) => string;
		displayUsername: (displayUsername: string) => string;
	},
	includeDisplayUsername: IncludeDisplayUsername = true as IncludeDisplayUsername,
) => {
	const fields = {
		username: {
			type: "string",
			required: false,
			sortable: true,
			unique: true,
			returned: true,
			transform: {
				input(value) {
					return typeof value !== "string"
						? value
						: normalizer.username(value as string);
				},
			},
		},
		displayUsername: {
			type: "string",
			required: false,
			transform: {
				input(value) {
					return typeof value !== "string"
						? value
						: normalizer.displayUsername(value as string);
				},
			},
		},
	} satisfies Record<string, DBFieldAttribute>;

	const userFields = includeDisplayUsername
		? fields
		: { username: fields.username };

	return {
		user: {
			fields: userFields,
		},
	} as {
		user: {
			fields: IncludeDisplayUsername extends false
				? Pick<typeof fields, "username">
				: typeof fields;
		};
	} satisfies BetterAuthPluginDBSchema;
};

export type UsernameSchema = ReturnType<typeof getSchema<true>>;

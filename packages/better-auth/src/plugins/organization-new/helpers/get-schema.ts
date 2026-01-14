import type { Prettify } from "@better-auth/core";
import type {
	BetterAuthPluginDBSchema,
	DBFieldAttribute,
} from "@better-auth/core/db";
import defu from "defu";
import type { Addon, ResolvedOrganizationOptions } from "../types";

/** Base organization fields */
type BaseOrganizationFields<DisableSlugs extends boolean> = {
	name: { type: "string"; required: true; sortable: true };
	logo: { type: "string"; required: false };
	createdAt: { type: "date"; required: true };
	metadata: { type: "string"; required: false };
} & (DisableSlugs extends true
	? {}
	: {
			slug: {
				type: "string";
				required: true;
				unique: true;
				sortable: true;
				index: true;
			};
		});

/** Base member fields */
type BaseMemberFields = {
	organizationId: {
		type: "string";
		required: true;
		references: { model: "organization"; field: "id" };
		index: true;
	};
	userId: {
		type: "string";
		required: true;
		references: { model: "user"; field: "id" };
		index: true;
	};
	role: {
		type: "string";
		required: true;
		sortable: true;
		defaultValue: "member";
	};
	createdAt: { type: "date"; required: true };
};

/** Base invitation fields */
type BaseInvitationFields = {
	organizationId: {
		type: "string";
		required: true;
		references: { model: "organization"; field: "id" };
		index: true;
	};
	email: { type: "string"; required: true; sortable: true; index: true };
	role: { type: "string"; required: false; sortable: true };
	status: {
		type: "string";
		required: true;
		sortable: true;
		defaultValue: "pending";
	};
	expiresAt: { type: "date"; required: true };
	createdAt: { type: "date"; required: true };
	inviterId: {
		type: "string";
		references: { model: "user"; field: "id" };
		required: true;
	};
};

/** Extract schema from a single addon, returns empty object if no schema */
type ExtractAddonSchema<A> = A extends {
	schema: infer S extends BetterAuthPluginDBSchema;
}
	? S
	: {};

/** Union to intersection helper */
type UnionToIntersection<U> = (
	U extends unknown
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

/** Merge all addon schemas from the use array into a single intersection */
type MergedAddonSchemas<Addons extends readonly Addon[]> = UnionToIntersection<
	ExtractAddonSchema<Addons[number]>
>;

/** Extract fields for a specific model from merged addon schemas */
type ExtractAddonModelFields<
	AddonSchemas,
	Model extends string,
> = AddonSchemas extends { [K in Model]: { fields: infer F } }
	? F extends Record<string, DBFieldAttribute>
		? F
		: {}
	: {};

/** Get additional fields from options for a specific model */
type GetAdditionalFields<
	O extends ResolvedOrganizationOptions,
	Model extends "organization" | "member" | "invitation",
> = O["schema"] extends { [K in Model]?: { additionalFields?: infer F } }
	? F extends Record<string, DBFieldAttribute>
		? F
		: {}
	: {};

/** Get extra tables from addon schemas (excluding organization, member, invitation) */
type GetAddonExtraTables<AddonSchemas> = Omit<
	AddonSchemas,
	"organization" | "member" | "invitation"
>;

/** Inferred schema type from options */
export type InferOrganizationSchema<O extends ResolvedOrganizationOptions> =
	Prettify<
		GetAddonExtraTables<MergedAddonSchemas<O["use"]>> & {
			organization: {
				modelName?: string;
				fields: Prettify<
					BaseOrganizationFields<O["disableSlugs"]> &
						ExtractAddonModelFields<
							MergedAddonSchemas<O["use"]>,
							"organization"
						> &
						GetAdditionalFields<O, "organization">
				>;
			};
			member: {
				modelName?: string;
				fields: Prettify<
					BaseMemberFields &
						ExtractAddonModelFields<MergedAddonSchemas<O["use"]>, "member"> &
						GetAdditionalFields<O, "member">
				>;
			};
			invitation: {
				modelName?: string;
				fields: Prettify<
					BaseInvitationFields &
						ExtractAddonModelFields<
							MergedAddonSchemas<O["use"]>,
							"invitation"
						> &
						GetAdditionalFields<O, "invitation">
				>;
			};
		}
	>;

export const getSchema = <O extends ResolvedOrganizationOptions>(
	opts: O,
): InferOrganizationSchema<O> => {
	const addonSchemas = opts.use
		.map((addon) => addon.schema)
		.filter((x) => x !== undefined)
		.reduce((acc, curr) => {
			return defu(acc, curr);
		}, {} as BetterAuthPluginDBSchema);
	const organization = {
		modelName: opts.schema?.organization?.modelName,
		fields: {
			name: {
				type: "string",
				required: true,
				sortable: true,
				fieldName: opts.schema?.organization?.fields?.name,
			},
			...(opts.disableSlugs
				? {}
				: {
						slug: {
							type: "string",
							required: true,
							unique: true,
							sortable: true,
							fieldName: opts.schema?.organization?.fields?.slug,
							index: true,
						},
					}),
			logo: {
				type: "string",
				required: false,
				fieldName: opts.schema?.organization?.fields?.logo,
			},
			createdAt: {
				type: "date",
				required: true,
				fieldName: opts.schema?.organization?.fields?.createdAt,
			},
			metadata: {
				type: "string",
				required: false,
				fieldName: opts.schema?.organization?.fields?.metadata,
			},
			...(addonSchemas.organization?.fields || {}),
			...(opts.schema?.organization?.additionalFields || {}),
		},
	} satisfies BetterAuthPluginDBSchema["organization"];

	const member = {
		modelName: opts.schema?.member?.modelName,
		fields: {
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
				fieldName: opts.schema?.member?.fields?.organizationId,
				index: true,
			},
			userId: {
				type: "string",
				required: true,
				fieldName: opts.schema?.member?.fields?.userId,
				references: {
					model: "user",
					field: "id",
				},
				index: true,
			},
			role: {
				type: "string",
				required: true,
				sortable: true,
				defaultValue: "member",
				fieldName: opts.schema?.member?.fields?.role,
			},
			createdAt: {
				type: "date",
				required: true,
				fieldName: opts.schema?.member?.fields?.createdAt,
			},
			...(addonSchemas.member?.fields || {}),
			...(opts.schema?.member?.additionalFields || {}),
		},
	} satisfies BetterAuthPluginDBSchema["member"];

	const invitation = {
		modelName: opts.schema?.invitation?.modelName,
		fields: {
			organizationId: {
				type: "string",
				required: true,
				references: {
					model: "organization",
					field: "id",
				},
				fieldName: opts.schema?.invitation?.fields?.organizationId,
				index: true,
			},
			email: {
				type: "string",
				required: true,
				sortable: true,
				fieldName: opts.schema?.invitation?.fields?.email,
				index: true,
			},
			role: {
				type: "string",
				required: false,
				sortable: true,
				fieldName: opts.schema?.invitation?.fields?.role,
			},
			status: {
				type: "string",
				required: true,
				sortable: true,
				defaultValue: "pending",
				fieldName: opts.schema?.invitation?.fields?.status,
			},
			expiresAt: {
				type: "date",
				required: true,
				fieldName: opts.schema?.invitation?.fields?.expiresAt,
			},
			createdAt: {
				type: "date",
				required: true,
				fieldName: opts.schema?.invitation?.fields?.createdAt,
				defaultValue: () => new Date(),
			},
			inviterId: {
				type: "string",
				references: {
					model: "user",
					field: "id",
				},
				fieldName: opts.schema?.invitation?.fields?.inviterId,
				required: true,
			},
			...(opts.schema?.invitation?.additionalFields || {}),
			...(addonSchemas.invitation?.fields || {}),
		},
	} satisfies BetterAuthPluginDBSchema["invitation"];

	const schema = {
		...(addonSchemas || {}),
		organization,
		member,
		invitation,
	};
	return schema as InferOrganizationSchema<O>;
};

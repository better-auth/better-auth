import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Prettify } from "better-call";
import * as z from "zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import { generateId } from "../../utils";
import type { OrganizationOptions } from "./types";

type InferSchema<
	Schema extends BetterAuthPluginDBSchema,
	TableName extends string,
	DefaultFields,
> = {
	modelName: Schema[TableName] extends { modelName: infer M }
		? M extends string
			? M
			: string
		: string;
	fields: {
		[K in keyof DefaultFields]: DefaultFields[K];
	} & (Schema[TableName] extends { additionalFields: infer F } ? F : {});
};

interface OrganizationRoleDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	role: {
		type: "string";
		required: true;
	};
	permission: {
		type: "string";
		required: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface TeamDefaultFields {
	name: {
		type: "string";
		required: true;
	};
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	createdAt: {
		type: "date";
		required: true;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface TeamMemberDefaultFields {
	teamId: {
		type: "string";
		required: true;
		references: {
			model: "team";
			field: "id";
		};
	};
	userId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
	createdAt: {
		type: "date";
		required: false;
	};
}

interface OrganizationDefaultFields {
	name: {
		type: "string";
		required: true;
		sortable: true;
	};
	slug: {
		type: "string";
		required: true;
		unique: true;
		sortable: true;
	};
	logo: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface MemberDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	userId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
	role: {
		type: "string";
		required: true;
		defaultValue: "member";
	};
	createdAt: {
		type: "date";
		required: true;
	};
}

interface InvitationDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	email: {
		type: "string";
		required: true;
		sortable: true;
	};
	role: {
		type: "string";
		required: true;
		sortable: true;
	};
	status: {
		type: "string";
		required: true;
		sortable: true;
		defaultValue: "pending";
	};
	expiresAt: {
		type: "date";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	inviterId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
}

interface SessionDefaultFields {
	activeOrganizationId: {
		type: "string";
		required: false;
	};
}

export type OrganizationSchema<O extends OrganizationOptions> =
	O["dynamicAccessControl"] extends { enabled: true }
		? {
				organizationRole: InferSchema<
					O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
					"organizationRole",
					OrganizationRoleDefaultFields
				>;
			} & {
				session: {
					fields: InferSchema<
						O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
						"session",
						SessionDefaultFields
					>["fields"];
				};
			}
		: {} & (O["teams"] extends { enabled: true }
				? {
						team: InferSchema<
							O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
							"team",
							TeamDefaultFields
						>;
						teamMember: InferSchema<
							O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
							"teamMember",
							TeamMemberDefaultFields
						>;
					}
				: {}) & {
					organization: InferSchema<
						O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
						"organization",
						OrganizationDefaultFields
					>;
					member: InferSchema<
						O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
						"member",
						MemberDefaultFields
					>;
					invitation: {
						modelName: O["schema"] extends BetterAuthPluginDBSchema
							? InferSchema<
									O["schema"],
									"invitation",
									InvitationDefaultFields
								>["modelName"]
							: string;
						fields: InferSchema<
							O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
							"invitation",
							InvitationDefaultFields
						>["fields"] &
							(O extends { teams: { enabled: true } }
								? {
										teamId: {
											type: "string";
											required: false;
											sortable: true;
										};
									}
								: {});
					};
					session: {
						fields: InferSchema<
							O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
							"session",
							SessionDefaultFields
						>["fields"] &
							(O["teams"] extends { enabled: true }
								? {
										activeTeamId: {
											type: "string";
											required: false;
										};
									}
								: {});
					};
				};

export const roleSchema = z.string();
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

export const organizationSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullish().optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v)))
		.optional(),
	createdAt: z.date(),
});

export const memberSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	userId: z.coerce.string(),
	role: roleSchema,
	createdAt: z.date().default(() => new Date()),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	role: roleSchema,
	status: invitationStatus,
	teamId: z.string().nullish(),
	inviterId: z.string(),
	expiresAt: z.date(),
	createdAt: z.date().default(() => new Date()),
});

export const teamSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	organizationId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date().optional(),
});

export const teamMemberSchema = z.object({
	id: z.string().default(generateId),
	teamId: z.string(),
	userId: z.string(),
	createdAt: z.date().default(() => new Date()),
});

export const organizationRoleSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	role: z.string(),
	permission: z.record(z.string(), z.array(z.string())),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

const defaultRoles = ["admin", "member", "owner"] as const;
export const defaultRolesSchema = z.union([
	z.enum(defaultRoles),
	z.array(z.enum(defaultRoles)),
]);

type CustomRolesSchema<O> = O extends { roles: { [key: string]: any } }
	? z.ZodType<keyof O["roles"] | Array<keyof O["roles"]>>
	: typeof defaultRolesSchema;

export type InferOrganizationZodRolesFromOption<
	O extends OrganizationOptions | undefined,
> = CustomRolesSchema<O>;

export type InferOrganizationRolesFromOption<
	O extends OrganizationOptions | undefined,
> = O extends { roles: any }
	? keyof O["roles"] extends infer K extends string
		? K
		: "admin" | "member" | "owner"
	: "admin" | "member" | "owner";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InferMember<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["teams"] extends {
		enabled: true;
	}
		? {
				id: string;
				organizationId: string;
				role: InferOrganizationRolesFromOption<O>;
				createdAt: Date;
				userId: string;
				teamId?: string | undefined;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string | undefined;
				};
			}
		: {
				id: string;
				organizationId: string;
				role: InferOrganizationRolesFromOption<O>;
				createdAt: Date;
				userId: string;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string | undefined;
				};
			}) &
		InferAdditionalFieldsFromPluginOptions<"member", O, isClientSide>
>;

export type InferOrganization<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide>
>;

export type InferTeam<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", O, isClientSide>
>;

export type InferInvitation<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["teams"] extends {
		enabled: true;
	}
		? {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
				teamId?: string | undefined;
			}
		: {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
			}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, isClientSide>
>;

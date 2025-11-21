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
	type: {
		type: "string";
		required: true;
		index: true;
	};
	name: {
		type: "string";
		required: true;
	};
	description: {
		type: "string";
		required: false;
	};
	isBuiltIn: {
		type: "boolean";
		required: true;
		defaultValue: false;
	};
	permissions: {
		type: "json";
		required: false;
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

interface TeamRoleDefaultFields {
	teamId: {
		type: "string";
		required: true;
		references: {
			model: "team";
			field: "id";
		};
	};
	type: {
		type: "string";
		required: true;
		index: true;
	};
	name: {
		type: "string";
		required: true;
	};
	description: {
		type: "string";
		required: false;
	};
	isBuiltIn: {
		type: "boolean";
		required: true;
		defaultValue: false;
	};
	permissions: {
		type: "json";
		required: false;
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

interface MemberOrganizationRoleDefaultFields {
	memberId: {
		type: "string";
		required: true;
		references: {
			model: "member";
			field: "id";
		};
	};
	organizationId: {
		type: "string";
		required: true;
		index: true;
	};
	role: {
		type: "string";
		required: true;
		index: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
}

interface MemberTeamRoleDefaultFields {
	team_member_id: {
		type: "string";
		required: true;
		references: {
			model: "teamMember";
			field: "id";
		};
	};
	teamId: {
		type: "string";
		required: true;
		index: true;
	};
	role: {
		type: "string";
		required: true;
		index: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
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
	organizationRoles: {
		type: "json";
		required: false;
	};
	teamRoles: {
		type: "json";
		required: false;
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

export type OrganizationSchema<O extends OrganizationOptions> = {
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
		>["fields"] & {
			teamIds: {
				type: "string";
				required: false;
				sortable: true;
			};
		};
	};
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
	organizationRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"organizationRole",
		OrganizationRoleDefaultFields
	>;
	teamRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"teamRole",
		TeamRoleDefaultFields
	>;
	memberOrganizationRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"memberOrganizationRole",
		MemberOrganizationRoleDefaultFields
	>;
	memberTeamRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"memberTeamRole",
		MemberTeamRoleDefaultFields
	>;
	session: {
		fields: InferSchema<
			O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
			"session",
			SessionDefaultFields
		>["fields"] & {
			activeTeamId: {
				type: "string";
				required: false;
			};
		};
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
	createdAt: z.date().default(() => new Date()),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	organizationRoles: z.array(z.string()).optional(),
	teamRoles: z.array(z.string()).optional(),
	status: invitationStatus,
	teamIds: z.string().default("").optional(),
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
	type: z.string(),
	name: z.string(),
	description: z.string().optional(),
	isBuiltIn: z.boolean().default(false),
	permissions: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export const teamRoleSchema = z.object({
	id: z.string().default(generateId),
	teamId: z.string(),
	type: z.string(),
	name: z.string(),
	description: z.string().optional(),
	isBuiltIn: z.boolean().default(false),
	permissions: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export const memberOrganizationRoleSchema = z.object({
	id: z.string().default(generateId),
	memberId: z.string(),
	organizationId: z.string(),
	role: z.string(),
	createdAt: z.date().default(() => new Date()),
});

export const memberTeamRoleSchema = z.object({
	id: z.string().default(generateId),
	team_member_id: z.string(),
	teamId: z.string(),
	role: z.string(),
	createdAt: z.date().default(() => new Date()),
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
export type TeamRole = z.infer<typeof teamRoleSchema>;
export type MemberOrganizationRole = z.infer<
	typeof memberOrganizationRoleSchema
>;
export type MemberTeamRole = z.infer<typeof memberTeamRoleSchema>;

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
	{
		id: string;
		organizationId: string;
		organizationRoles: string[];
		createdAt: Date;
		userId: string;
		user: {
			id: string;
			email: string;
			name: string;
			image?: string | undefined;
		};
	} & InferAdditionalFieldsFromPluginOptions<"member", O, isClientSide>
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

export type InferOrganizationRole<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	OrganizationRole &
		InferAdditionalFieldsFromPluginOptions<"organizationRole", O, isClientSide>
>;

export type InferTeamRole<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	TeamRole &
		(O["schema"] extends { teamRole?: { additionalFields?: infer F } }
			? F extends Record<string, any>
				? isClientSide extends true
					? Omit<
							F,
							{
								[K in keyof F]: F[K] extends { input: false } ? K : never;
							}[keyof F]
						>
					: F
				: {}
			: {})
>;

export type InferInvitation<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	{
		id: string;
		organizationId: string;
		email: string;
		organizationRoles?: string[] | undefined;
		teamRoles?: string[] | undefined;
		status: InvitationStatus;
		inviterId: string;
		expiresAt: Date;
		createdAt: Date;
		teamIds?: string | undefined;
	} & InferAdditionalFieldsFromPluginOptions<"invitation", O, isClientSide>
>;

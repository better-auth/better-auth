import * as z from "zod/v4";
import { generateId } from "../../utils";
import type { OrganizationOptions } from "./types";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type { Prettify } from "better-call";

export const role = z.string();
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
	role,
	createdAt: z.date().default(() => new Date()),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	teamId: z.string().nullish(),
	inviterId: z.string(),
	expiresAt: z.date(),
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
> = O extends { roles: any } ? keyof O["roles"] : "admin" | "member" | "owner";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InferMember<O extends OrganizationOptions> = O["teams"] extends {
	enabled: true;
}
	? {
			id: string;
			organizationId: string;
			role: InferOrganizationRolesFromOption<O>;
			createdAt: Date;
			userId: string;
			teamId?: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		}
	: {
			id: string;
			organizationId: string;
			role: InferOrganizationRolesFromOption<O>;
			createdAt: Date;
			userId: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		};

export type InferOrganization<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide>
>;

export type InferTeam<O extends OrganizationOptions> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", O>
>;

export type InferInvitation<O extends OrganizationOptions> =
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
				teamId?: string;
			}
		: {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
			}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, false>;

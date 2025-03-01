import { z, ZodLiteral } from "zod";
import { generateId } from "../../utils";
import type { OrganizationOptions } from "./organization";

export const role = z.string();
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

export const organizationSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	slug: z.string(),
	logo: z.string().nullish(),
	metadata: z
		.record(z.string())
		.or(z.string().transform((v) => JSON.parse(v)))

		.nullish(),
	createdAt: z.date(),
});

export const memberSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	userId: z.string(),
	role,
	createdAt: z.date().default(() => new Date()),
	teamId: z.string().optional(),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	teamId: z.string().optional(),
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
export type Organization = z.infer<typeof organizationSchema> &
	Record<string, any>;
export type Member = z.infer<typeof memberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type InferZodRolesFromOption<O extends OrganizationOptions | undefined> =
	ZodLiteral<
		O extends {
			roles: {
				[key: string]: any;
			};
		}
			? keyof O["roles"] | (keyof O["roles"])[]
			: "admin" | "member" | "owner" | ("admin" | "member" | "owner")[]
	>;
export type InferRolesFromOption<O extends OrganizationOptions | undefined> =
	O extends { roles: any } ? keyof O["roles"] : "admin" | "member" | "owner";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InferMember<O extends OrganizationOptions> = O["teams"] extends {
	enabled: true;
}
	? {
			id: string;
			organizationId: string;
			role: InferRolesFromOption<O>;
			createdAt: Date;
			userId: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		}
	: {
			id: string;
			organizationId: string;
			createdAt: Date;
			role: InferRolesFromOption<O>;
			teamId?: string;
			userId: string;
			user: {
				email: string;
				name: string;
				image?: string;
			};
		};

export type InferInvitation<O extends OrganizationOptions> =
	O["teams"] extends {
		enabled: true;
	}
		? {
				id: string;
				organizationId: string;
				email: string;
				role: InferRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
			}
		: {
				id: string;
				organizationId: string;
				email: string;
				role: InferRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				teamId?: string;
			};

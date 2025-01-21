import { z, ZodLiteral } from "zod";
import { generateId } from "../../utils";
import type { SwarmOptions } from "./swarm";

export const role = z.string();
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

export const swarmSchema = z.object({
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
	swarmId: z.string(),
	userId: z.string(),
	role,
	createdAt: z.date(),
});

export const invitationSchema = z.object({
	id: z.string().default(generateId),
	swarmId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	/**
	 * The id of the user who invited the user.
	 */
	inviterId: z.string(),
	expiresAt: z.date(),
});

export type Swarm = z.infer<typeof swarmSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type SwarmInput = z.input<typeof swarmSchema>;

export type InferRolesFromOption<O extends SwarmOptions | undefined> =
	ZodLiteral<
		O extends { roles: any } ? keyof O["roles"] : "admin" | "member" | "owner"
	>;

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
  teamId: z.string().optional(),
  createdAt: z.date(),
});

export const invitationSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string(),
  email: z.string(),
  role,
  status: invitationStatus,
  /**
   * The id of the user who invited the user.
   */
  teamId: z.string().optional(),
  inviterId: z.string(),
  expiresAt: z.date(),
});
export const teamSchema = z.object({
  id: z.string().default(generateId),
  name: z.string().min(1, "Team name is required"),
  description: z.optional(z.string().min(1, "Description is required")),
  status: z.string().optional(), // status of the team
  organizationId: z.string(), // Organization ID (required)
  createdAt: z.date(), // Team creation date (required)
});
export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type InferRolesFromOption<O extends OrganizationOptions | undefined> =
  ZodLiteral<
    O extends { roles: any } ? keyof O["roles"] : "admin" | "member" | "owner"
  >;

import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod/v4";

export const organizationRoleSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	role: z.string().min(1),
	permissions: z.record(z.string(), z.array(z.string())),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export type OrganizationRoleInput = z.input<typeof organizationRoleSchema>;

import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod/v4";

const organizationRoleSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	role: z.string(),
	permission: z.record(z.string(), z.array(z.string())),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

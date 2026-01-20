import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import * as z from "zod";

export const schema = {
	cibaRequest: {
		fields: {
			authReqId: {
				type: "string",
				required: true,
				unique: true,
			},
			clientId: {
				type: "string",
				required: true,
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
					onDelete: "cascade",
				},
			},
			scope: {
				type: "string",
				required: false,
			},
			bindingMessage: {
				type: "string",
				required: false,
			},
			status: {
				type: "string",
				required: true,
			},
			expiresAt: {
				type: "date",
				required: true,
			},
			interval: {
				type: "number",
				required: true,
			},
			lastPolledAt: {
				type: "date",
				required: false,
			},
			approvedAt: {
				type: "date",
				required: false,
			},
			deniedAt: {
				type: "date",
				required: false,
			},
		},
	},
} satisfies BetterAuthPluginDBSchema;

export const cibaRequestSchema = z.object({
	id: z.string(),
	authReqId: z.string(),
	clientId: z.string(),
	userId: z.string(),
	scope: z.string().optional(),
	bindingMessage: z.string().optional(),
	status: z.enum(["pending", "approved", "denied", "expired"]),
	expiresAt: z.date(),
	interval: z.number(),
	lastPolledAt: z.date().optional(),
	approvedAt: z.date().optional(),
	deniedAt: z.date().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type CIBARequest = z.infer<typeof cibaRequestSchema>;

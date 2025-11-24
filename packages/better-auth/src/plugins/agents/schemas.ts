import { z } from "zod"

export const createAgentBodySchema = z.object({
  name: z.string().min(1),
  type: z
    .enum([
      "ai_assistant",
      "service_account",
      "bot",
      "workflow",
      "integration",
      "custom",
    ])
    .optional(),
  status: z.enum(["active", "inactive", "suspended", "deleted"]).optional(),
  configuration: z.record(z.string(), z.any()).optional(),
  ownerType: z.enum(["user", "organization"]).optional(),
  ownerId: z.string().optional(),
  organizationId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const listAgentsQuerySchema = z.object({
  ownerType: z.enum(["user", "organization"]).optional(),
  ownerId: z.string().optional(),
  organizationId: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})

export const getAgentQuerySchema = z.object({
  id: z.string().min(1),
})

export const updateAgentBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z
    .enum([
      "ai_assistant",
      "service_account",
      "bot",
      "workflow",
      "integration",
      "custom",
    ])
    .optional(),
  status: z.enum(["active", "inactive", "suspended", "deleted"]).optional(),
  configuration: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const deleteAgentBodySchema = z.object({
  id: z.string().min(1),
})

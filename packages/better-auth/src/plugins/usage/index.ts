import type { BetterAuthPlugin, InferOptionSchema } from '../../types'
import { mergeSchema } from '../../db'
import { schema } from './schema'
import { createAuthEndpoint } from '../../api'
import * as z from 'zod/v4'

type UsageOptions = {
  allowClientTracking?: boolean
  schema: InferOptionSchema<typeof schema>
}

export const usage = (
  options?: UsageOptions
) => {
  const SERVER_ONLY: boolean = !(options?.allowClientTracking ?? false);
  return {
    id: 'usage',
    schema: mergeSchema(schema, options?.schema),
    endpoints: {
      trackUsage: createAuthEndpoint(
        '/usage/track',
        {
          method: 'POST',
          body: z.object({
            timestamp: z.date().default(() => new Date()),
            eventType: z.string().min(1),
            userId: z.string(),
            transactionId: z.string().optional(),
            payload: z.record(z.string(), z.any()).default({}),
          }),
          metadata: {
            SERVER_ONLY,
          }
        },
        async (ctx) => {
          await ctx.context.adapter.create(
            {
              model: 'usage',
              data: {
                timestamp: ctx.body.timestamp,
                eventType: ctx.body.eventType,
                userId: ctx.body.userId,
                transactionId: ctx.body.transactionId,
                payload: ctx.body.payload,
              },
            },
          )
        }
      )
    }
  } satisfies BetterAuthPlugin;
}
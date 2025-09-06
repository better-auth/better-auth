import type { AuthPluginSchema } from '../../types'

export const schema = {
  usage: {
    fields: {
      timestamp: {
        type: "date",
        required: true,
      },
      eventType: {
        type: "string",
        required: true,
      },
      userId: {
        type: "string",
        required: true,
      },
      /**
       * Optional transaction ID to group related usage events (e.g., all events from a single API request)
       */
      transactionId: {
        type: "string",
        required: false,
      },
      /**
       * Key-value pairs to store additional metadata about the usage event
       */
      payload: {
        type: "json",
        required: true,
      }
    },
  }
} satisfies AuthPluginSchema;
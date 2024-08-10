import { z } from "zod"
import { createAuthMiddleware } from "../call"
import { APIError } from "better-call"
import { providerList } from "../../provider"

export const useOAuthProvider = createAuthMiddleware(
    {
        body: z.object({
            provider: z.enum(providerList)
        })
    }, async (ctx) => {
        const providerId = ctx.body.provider
        const opts = ctx.options

        const provider = ctx.options.providers?.find(p => p.id === providerId)
        if (!provider) {
            throw new APIError("BAD_REQUEST", {
                message: "Invalid provider. Make sure you have the correct provider id. And you mounted the provider in the config file."
            })
        }
        return {
            provider
        }
    }
)
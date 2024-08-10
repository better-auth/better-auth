import { router } from "./api"
import { BetterAuthOptions } from "./types/options"
import * as endpoints from "./api/endpoints"
import { UnionToIntersection } from "type-fest"
import { Plugin } from "./types/plugins"
import { getCookies } from "./utils/cookies"

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
    const pluginEndpoints = options.plugins?.reduce((acc, plugin) => {
        return {
            ...acc,
            ...plugin.endpoints
        }
    }, {} as Record<string, any>)
    const api = {
        ...endpoints,
        ...pluginEndpoints
    }
    type PluginEndpoint = UnionToIntersection<O['plugins'] extends Array<infer T> ? T extends Plugin ? T['endpoints'] : {} : {}>
    type Endpoint = typeof endpoints & PluginEndpoint
    return {
        handler: router(options).handler,
        api: Object.entries(api).reduce((acc, [key, value]) => {
            acc[key] = (ctx: any) => {
                //@ts-ignore
                return value({
                    ...ctx,
                    options,
                    authCookies: getCookies(options)
                })
            }
            return acc
        }, {} as Record<string, any>) as Endpoint,
        options
    }
}


export type BetterAuth<Endpoints extends Record<string, any> = typeof endpoints> = {
    handler: (request: Request) => Promise<Response>,
    api: Endpoints,
    options: BetterAuthOptions
}
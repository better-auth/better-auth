
import { Context, createEndpointCreator, createMiddlewareCreator, Endpoint, EndpointResponse } from "better-call"
import { BetterAuthOptions } from "../types/options"
import { BetterAuthCookies } from "../utils/cookies";

export const createAuthEndpoint = createEndpointCreator<{
    options: BetterAuthOptions
    authCookies: BetterAuthCookies
}>();

export const createAuthMiddleware = createMiddlewareCreator<{
    options: BetterAuthOptions
    authCookies: BetterAuthCookies
}>();


export type AuthEndpoint = Endpoint<(ctx: {
    options: BetterAuthOptions,
    body: any,
    query: any,
}) => Promise<EndpointResponse>>

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
import { base64 } from "@better-auth/utils/base64";
import { APIError } from "../../api";
import type { GenericEndpointContext, Where } from "../../types";
import type { OAuthAccessToken } from "./types";

export async function introspection(
    ctx: GenericEndpointContext,
) { 
    if (!ctx.request) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "request not found",
            error: "invalid_request",
        });
    }
    const authorization = ctx.request.headers.get("authorization");
    
    if (
        !authorization || 
        !authorization.startsWith("Basic ")
    ) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid or missing authorization header",
            error: "invalid_request",
        });
    }

    let authorizationValue: string | null = null
    try {
        const encoded = authorization.replace("Basic ", "");
        authorizationValue = new TextDecoder().decode(base64.decode(encoded));
    } catch (e) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid authorization header format",
            error: "invalid_request",
        });
    }

    if (!authorizationValue || !authorizationValue.includes(":")) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid authorization header format",
            error: "invalid_request",
        });
    }
    
    const [id, secret] = authorizationValue.split(":");
    if (!id || !secret) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid authorization header format",
            error: "invalid_request",
        });
    }
    
    const client = await ctx.context.adapter
        .findOne<Record<string, any>>({
            model: "oauthApplication",
            where: [{ field: "clientId", value: id.toString() }],
        })
    if (!client) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid client id",
            error: "invalid_client",
        });
    }
    if (client.disabled) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "client is disabled",
            error: "invalid_client",
        });
    }
    if (client.clientSecret !== secret.toString()) {
        throw new APIError("UNAUTHORIZED", {
            error_description: "invalid client secret",
            error: "invalid_client",
        });
    }

    const { body } = ctx
    if (!body) {
        throw new APIError("BAD_REQUEST", {
            error_description: "request body not found",
            error: "invalid_request",
        });
    }
    
    const { token_type_hint, token } = body
    if (!token) {
        throw new APIError("BAD_REQUEST", {
            error_description: "request token not found",
            error: "invalid_request",
        });
    }

    const tokenTypeHintWhere: Where[] = []

    if (token_type_hint === "access_token" || !token_type_hint) {
        tokenTypeHintWhere.push({ field: "accessToken", value: token, connector: "OR" })
    }
    
    if (token_type_hint === "refresh_token" || !token_type_hint) {
        tokenTypeHintWhere.push({ field: "refreshToken", value: token, connector: "OR" })
    }
                        
    const accessToken = await ctx.context.adapter.findOne<OAuthAccessToken>({
        model: "oauthAccessToken",
        where: tokenTypeHintWhere,
    });

    if (!accessToken || accessToken.accessTokenExpiresAt < new Date()) {
        return ctx.json({ active: false })
    }

    const user = await ctx.context.internalAdapter.findUserById(accessToken.userId)

    if (!user) {
        throw new APIError("BAD_REQUEST", {
            error_description: "user not found",
            error: "invalid_token",
        });
    }

    const expiry = token === accessToken.accessToken
        ? accessToken.accessTokenExpiresAt
        : accessToken.refreshTokenExpiresAt

    return ctx.json({
        active: true,
        scope: accessToken.scopes,
        client_id: accessToken.clientId,
        username: user.name,
        token_type: "Bearer",
        exp: Math.floor(expiry.getTime() / 1000),
    })
}

import { GitHub, Google, OAuth2Provider, OAuth2ProviderWithPKCE } from "arctic";
import { Constructor } from "type-fest";
import { LiteralString } from "../types/helper";

type ProviderOptions = {
    clientId: string
    clientSecret: string
}

export const createOAuthProvider = <C extends Constructor<OAuth2Provider | OAuth2ProviderWithPKCE>, ID extends LiteralString>(id: ID, instance: C) => {
    type CParam = ConstructorParameters<C>[2]
    type Options = CParam extends string ? {
        redirectURI?: CParam
    } : CParam
    return (params: ProviderOptions, options?: Options) => {
        return {
            id: id,
            type: "oauth2" as const,
            provider: new instance(params.clientId, params.clientSecret, options)
        }
    }
}

export const github = createOAuthProvider("github", GitHub)
export const google = createOAuthProvider("google", Google)

export const providers = {
    github,
    google
}

export const providerList = Object.keys(providers) as ["github", ...(keyof typeof providers)[]]

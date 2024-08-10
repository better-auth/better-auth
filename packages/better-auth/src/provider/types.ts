import { OAuth2Provider as ArcticOAuth2Provider, OAuth2ProviderWithPKCE } from "arctic";
import { LiteralString } from "../types/helper";
import { providerList } from ".";


interface CustomProvider { }

export type Provider = {
    id: LiteralString
    type: "oauth2"
    provider: ArcticOAuth2Provider | OAuth2ProviderWithPKCE
} | {
    id: LiteralString
    type: "custom"
    provider: CustomProvider
}

export type ProviderList = typeof providerList
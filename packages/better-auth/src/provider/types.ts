import {
	OAuth2Provider as ArcticOAuth2Provider,
	OAuth2ProviderWithPKCE,
} from "arctic";
import { LiteralString } from "../types/helper";
import { providerList } from ".";
import { ZodSchema } from "zod";
import { TokenResponseBody } from "oslo/oauth2";

export type OAuthUserInfo = {
	endpoint?: string;
	schema: ZodSchema;
	getUserInfo?: (token: TokenResponseBody) => Record<string, any>;
};

export type OAuthProvider = {
	id: LiteralString;
	type: "oauth2";
	provider: ArcticOAuth2Provider | OAuth2ProviderWithPKCE;
	userInfo: OAuthUserInfo;
};

export type CustomProvider = {
	id: LiteralString;
	type: "custom";
	provider: CustomProvider;
};

export type Provider = OAuthProvider | CustomProvider;

export type ProviderList = typeof providerList;

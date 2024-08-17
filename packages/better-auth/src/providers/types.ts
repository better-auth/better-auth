import {
	OAuth2Provider as ArcticOAuth2Provider,
	OAuth2ProviderWithPKCE,
	Tokens,
} from "arctic";
import { LiteralString } from "../types/helper";
import { providerList } from ".";
import { User } from "../schema";

export type OAuthUserInfo = {
	getUserInfo: (token: Tokens) => Promise<User | null>;
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

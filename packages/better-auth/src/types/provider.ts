import type { User } from "../adapters/schema";
import type { oAuthProviderList } from "../social-providers";
import type { LiteralString } from "./helper";
import { OAuth2Tokens } from "arctic";

export interface OAuthProvider<
	T extends Record<string, any> = Record<string, any>,
> {
	id: LiteralString;
	createAuthorizationURL: (data: {
		state: string;
		codeVerifier: string;
		scopes?: string[];
	}) => URL;
	name: string;
	validateAuthorizationCode: (
		code: string,
		codeVerifier?: string,
	) => Promise<OAuth2Tokens>;
	getUserInfo: (token: OAuth2Tokens) => Promise<{
		user: Omit<User, "createdAt" | "updatedAt">;
		data: T;
	} | null>;
	refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
	revokeToken?: (token: string) => Promise<void>;
}

export type OAuthProviderList = typeof oAuthProviderList;

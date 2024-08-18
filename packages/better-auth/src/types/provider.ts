import {
	OAuth2Provider as ArcticOAuth2Provider,
	OAuth2ProviderWithPKCE,
	Tokens,
} from "arctic";
import { LiteralString } from "./helper";
import { providerList } from "../providers";
import { User } from "../schema";
import { FieldAttribute } from "../db";
import { Migration } from "kysely";

export interface BaseProvider {
	id: LiteralString;
	/**
	 * Database schema for the provider.
	 */
	schema?: {
		[table: string]: {
			fields: {
				[field: string]: FieldAttribute;
			};
			disableMigration?: boolean;
		};
	};
	/**
	 * The migrations of the provider. If you define schema that will automatically create
	 * migrations for you.
	 *
	 * ⚠️ Only uses this if you dont't want to use the schema option and you disabled migrations for
	 * the tables.
	 */
	migrations?: Record<string, Migration>;
}

export type OAuthUserInfo = {
	getUserInfo: (token: Tokens) => Promise<User | null>;
};

export interface OAuthProvider extends BaseProvider {
	type: "oauth2";
	provider: ArcticOAuth2Provider | OAuth2ProviderWithPKCE;
	userInfo: OAuthUserInfo;
}

export interface CustomProvider extends BaseProvider {
	type: "custom";
	provider: CustomProvider;
}

export type Provider = OAuthProvider | CustomProvider;

export type ProviderList = typeof providerList;

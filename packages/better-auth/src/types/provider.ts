import {
	OAuth2Provider as ArcticOAuth2Provider,
	OAuth2ProviderWithPKCE,
	Tokens,
} from "arctic";
import { LiteralString } from "./helper";
import { oAuthProviderList } from "../social-providers";
import { User } from "../adapters/schema";
import { FieldAttribute } from "../db";
import { Migration } from "kysely";
import { AuthEndpoint } from "../api/call";
import { Context, Endpoint } from "better-call";

export interface Provider {
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
	provider: ArcticOAuth2Provider | OAuth2ProviderWithPKCE;
	userInfo: OAuthUserInfo;
}

export type OAuthUserInfo = {
	getUserInfo: (token: Tokens) => Promise<User | null>;
};

export type OAuthProviderList = typeof oAuthProviderList;

import type {
	OAuth2Provider as ArcticOAuth2Provider,
	OAuth2ProviderWithPKCE,
	Tokens,
} from "arctic";
import type { Migration } from "kysely";
import type { User } from "../adapters/schema";
import type { FieldAttribute } from "../db";
import type { oAuthProviderList } from "../social-providers";
import type { LiteralString } from "./helper";

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

import type { BetterAuthPlugin } from "better-auth";

// Optional types - will be any if @better-auth/scim is not installed
type SCIMOptions = any;
export type StoreSCIMToken = any;

export interface SCIMPluginWithOptions extends BetterAuthPlugin {
	options?: SCIMOptions;
}

export interface DirectorySyncConnection {
	id: string;
	organizationId: string;
	providerId: string;
	scimEndpoint: string;
	userCount: number;
}

export interface DirectorySyncConnectionWithToken
	extends DirectorySyncConnection {
	scimToken: string;
}

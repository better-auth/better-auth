import type { User } from "better-auth";
import type { Member } from "better-auth/plugins";

export interface SCIMProvider {
	id: string;
	providerId: string;
	scimToken: string;
	organizationId?: string;
	userId?: string;
}

export type SCIMName = {
	formatted?: string;
	givenName?: string;
	familyName?: string;
};

export type SCIMEmail = { value?: string; primary?: boolean };

export type SCIMOptions = {
	/**
	 * SCIM provider ownership configuration. When enabled, each provider
	 * connection is linked to the user who generated its token.
	 */
	providerOwnership?: {
		enabled: boolean;
	};
	/**
	 * Minimum organization role(s) required for SCIM management operations
	 * (generate-token, list/get/delete provider connections).
	 *
	 * Defaults to `["admin", organization.creatorRole ?? "owner"]`.
	 */
	requiredRole?: string[];
	/**
	 * Default list of SCIM providers for testing.
	 * These will take precedence over the database when present.
	 */
	defaultSCIM?: Omit<SCIMProvider, "id">[];
	/**
	 * A callback that runs before a new SCIM token is generated.
	 * Runs after the built-in role check, so it can add additional
	 * restrictions but cannot bypass the role requirement.
	 */
	beforeSCIMTokenGenerated?: (payload: {
		user: User;
		member: Member | null;
		scimToken: string;
	}) => Promise<void>;
	/**
	 * A callback that runs after a new SCIM token is generated.
	 */
	afterSCIMTokenGenerated?: (payload: {
		user: User;
		member: Member | null;
		scimToken: string;
		scimProvider: SCIMProvider;
	}) => Promise<void>;
	/**
	 * How to store the SCIM token in the database.
	 *
	 * @default "plain"
	 */
	storeSCIMToken?:
		| (
				| "hashed"
				| "plain"
				| "encrypted"
				| { hash: (scimToken: string) => Promise<string> }
				| {
						encrypt: (scimToken: string) => Promise<string>;
						decrypt: (scimToken: string) => Promise<string>;
				  }
		  )
		| undefined;
};

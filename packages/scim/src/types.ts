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
	 * Controls whether SCIM provisioning may link to a *pre-existing* Better
	 * Auth user whose email matches the incoming SCIM resource.
	 *
	 * Disabled by default: when a user with the same email already exists,
	 * `createSCIMUser` returns `409` (uniqueness) instead of silently creating a
	 * SCIM account link for that user. Linking by email alone would give a SCIM
	 * token access to an account it never provisioned.
	 *
	 * - `true` restores the legacy behavior of linking any existing user that
	 *   matches by email. Only use this with a fully trusted token-issuance flow.
	 * - An object enables linking only when *every* provided constraint passes.
	 */
	linkExistingUsers?:
		| boolean
		| {
				/**
				 * Only link when the email's domain is in this allow-list
				 * (case-insensitive). An empty/absent list is not a match.
				 */
				trustedDomains?: string[];
				/**
				 * For organization-scoped tokens, only link a user who is already
				 * a member of the token's organization (never auto-add them). Has
				 * no effect for non-org (personal) tokens, which then never match
				 * on this constraint.
				 */
				requireExistingOrgMembership?: boolean;
				/**
				 * Full control: return `true` to allow linking the matched user.
				 */
				shouldLinkUser?: (payload: {
					user: User;
					email: string;
					provider: { providerId: string; organizationId?: string };
				}) => boolean | Promise<boolean>;
		  };
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
	 * Authorize who may generate a SCIM token. Runs after the built-in checks
	 * (org-scoped tokens still require org membership + the required role), so it
	 * can add restrictions but cannot loosen them.
	 *
	 * Use this to lock down *personal* (non-org-scoped) token creation, which is
	 * otherwise available to any authenticated user. SCIM tokens can provision
	 * and manage users, so return `false` to deny. `member` is `null` for
	 * personal tokens.
	 */
	canGenerateToken?: (payload: {
		user: User;
		providerId: string;
		organizationId?: string;
		member: Member | null;
	}) => boolean | Promise<boolean>;
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

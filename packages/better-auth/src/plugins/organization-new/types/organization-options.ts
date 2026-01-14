import type { Awaitable } from "@better-auth/core";
import type { DBFieldAttribute, User } from "@better-auth/core/db";
import type {
	AccessControl,
	Invitation,
	Member,
	Organization,
	Role,
} from "../..";
import type { Addon } from "./addon";
import type { OrganizationHooks } from "./organization-hooks";

export type ResolvedOrganizationOptions = {
	use: Addon[];
	allowUserToCreateOrganization: (user: User) => Awaitable<boolean>;
	organizationLimit: (user: User) => Awaitable<number>;
	creatorRole: string;
	membershipLimit: number;
	disableSlugs: boolean;
	roles: Record<string, Role>;
	ac?: AccessControl;
	schema?: OrganizationOptionsSchema;
	hooks?: OrganizationHooks;
};

export type OrganizationOptions = {
	/**
	 * Organization addons to use.
	 * @example
	 * ```ts
	 * use: [teams(), accessControl()]
	 * ```
	 */
	use?: Addon[];
	/**
	 * Whether the user is allowed to create an organization.
	 * @example
	 * ```ts
	 * allowUserToCreateOrganization: async (user) => {
	 *   return user.plan === "pro";
	 * }
	 * ```
	 *
	 * @default true
	 */
	allowUserToCreateOrganization?:
		| boolean
		| ((user: User) => Awaitable<boolean | undefined>);
	/**
	 * The maximum number of organizations a user can create.
	 * @example
	 * ```ts
	 * organizationLimit: async (user) => {
	 *   return user.plan === "pro" ? 10 : 5;
	 * }
	 * ```
	 *
	 * @default 100
	 */
	organizationLimit?: number | ((user: User) => Awaitable<number | undefined>);
	/**
	 * The role that is assigned to the creator of the organization.
	 * @example
	 * ```ts
	 * creatorRole: "owner";
	 * ```
	 *
	 * @default "owner"
	 */
	creatorRole?: string;
	/**
	 * The maximum number of members allowed in an organization.
	 * @example
	 * ```ts
	 * membershipLimit: 100;
	 * ```
	 *
	 * @default 100
	 */
	membershipLimit?: number;
	/**
	 * Whether to disable slugs for organizations.
	 *
	 * Don't forget to re-run schema generation or migrations after changing this option.
	 *
	 * @default false
	 */
	disableSlugs?: boolean;
	/**
	 * The access control for the organization plugin.
	 */
	ac?: AccessControl;
	/**
	 * Any additional roles for the organization plugin.
	 */
	roles?: Record<string, Role>;
	/**
	 * Hooks for the organization plugin.
	 */
	hooks?: OrganizationHooks;
	/**
	 * The schema for the organization plugin.
	 */
	schema?: OrganizationOptionsSchema;
};

type OrganizationOptionsSchema =
	| {
			session?: {
				fields?: {
					activeOrganizationId?: string;
				};
			};
			organization?: {
				modelName?: string;
				fields?: {
					[key in keyof Omit<Organization, "id">]?: string;
				};
				additionalFields?: {
					[key in string]: DBFieldAttribute;
				};
			};
			member?: {
				modelName?: string;
				fields?: {
					[key in keyof Omit<Member, "id">]?: string;
				};
				additionalFields?: {
					[key in string]: DBFieldAttribute;
				};
			};
			invitation?: {
				modelName?: string;
				fields?: {
					[key in keyof Omit<Invitation, "id">]?: string;
				};
				additionalFields?: {
					[key in string]: DBFieldAttribute;
				};
			};
	  }
	| undefined;

import type { Awaitable, Prettify } from "@better-auth/core";
import type { DBFieldAttribute, User } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type { AccessControl, Role } from "../access";
import type { InferOrganizationRolesFromOption } from "./access";
import type { Invitation, Member, Organization } from "./schema";
import type { PrettifyDeep } from "../../types";

export interface OrganizationAddons {
	id: string;
	endpoints?: Record<string, any>;
	schema?: Record<string, any>;
}

export type OrganizationOptions = {
	/**
	 * Organization addons to use.
	 * @example
	 * ```ts
	 * use: [teams(), accessControl()]
	 * ```
	 */
	use?: OrganizationAddons[];
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

export type ResolvedOrganizationOptions = {
	use: OrganizationAddons[];
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

export type OrganizationHooks =
	| {
			/**
			 * A callback that runs before the organization is created
			 *
			 * You can return a `data` object to override the default data.
			 *
			 * @example
			 * ```ts
			 * beforeCreateOrganization: async (data) => {
			 * 	return {
			 * 		data: {
			 * 			...data.organization,
			 * 		},
			 * 	};
			 * }
			 * ```
			 *
			 * You can also throw `new APIError` to stop the organization creation.
			 *
			 * @example
			 * ```ts
			 * beforeCreateOrganization: async (data) => {
			 * 	throw new APIError("BAD_REQUEST", {
			 * 		message: "Organization creation is disabled",
			 * 	});
			 * }
			 */
			beforeCreateOrganization?: (data: {
				organization: {
					name?: string;
					slug?: string;
					logo?: string;
					metadata?: Record<string, any>;
					[key: string]: any;
				};
				user: User & Record<string, any>;
			}) => Promise<void | {
				data: Record<string, any>;
			}>;
			/**
			 * A callback that runs after the organization is created
			 */
			afterCreateOrganization?: (data: {
				organization: Organization & Record<string, any>;
				member: Member & Record<string, any>;
				user: User & Record<string, any>;
			}) => Promise<void>;
			/**
			 * A callback that runs before the organization is updated
			 *
			 * You can return a `data` object to override the default data.
			 *
			 * @example
			 * ```ts
			 * beforeUpdateOrganization: async (data) => {
			 * 	return { data: { ...data.organization } };
			 * }
			 */
			beforeUpdateOrganization?: (data: {
				organization: {
					name?: string;
					slug?: string;
					logo?: string;
					metadata?: Record<string, any>;
					[key: string]: any;
				};
				user: User & Record<string, any>;
				member: Member & Record<string, any>;
			}) => Promise<void | {
				data: {
					name?: string;
					slug?: string;
					logo?: string;
					metadata?: Record<string, any>;
					[key: string]: any;
				};
			}>;
			/**
			 * A callback that runs after the organization is updated
			 *
			 * @example
			 * ```ts
			 * afterUpdateOrganization: async (data) => {
			 * 	console.log(data.organization);
			 * }
			 * ```
			 */
			afterUpdateOrganization?: (data: {
				/**
				 * Updated organization object
				 *
				 * This could be `null` if an adapter doesn't return updated organization.
				 */
				organization: (Organization & Record<string, any>) | null;
				user: User & Record<string, any>;
				member: Member & Record<string, any>;
			}) => Promise<void>;
			/**
			 * A callback that runs before the organization is deleted
			 */
			beforeDeleteOrganization?: (data: {
				organization: Organization & Record<string, any>;
				user: User & Record<string, any>;
			}) => Promise<void>;
			/**
			 * A callback that runs after the organization is deleted
			 */
			afterDeleteOrganization?: (data: {
				organization: Organization & Record<string, any>;
				user: User & Record<string, any>;
			}) => Promise<void>;
			/**
			 * Member hooks
			 */

			/**
			 * A callback that runs before a member is added to an organization
			 *
			 * You can return a `data` object to override the default data.
			 *
			 * @example
			 * ```ts
			 * beforeAddMember: async (data) => {
			 * 	return {
			 * 		data: {
			 * 			...data.member,
			 * 			role: "custom-role"
			 * 		}
			 * 	};
			 * }
			 * ```
			 */
			beforeAddMember?: (data: {
				member: {
					userId: string;
					organizationId: string;
					role: string;
					[key: string]: any;
				};
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void | {
				data: Record<string, any>;
			}>;

			/**
			 * A callback that runs after a member is added to an organization
			 */
			afterAddMember?: (data: {
				member: Member & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs before a member is removed from an organization
			 */
			beforeRemoveMember?: (data: {
				member: Member & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs after a member is removed from an organization
			 */
			afterRemoveMember?: (data: {
				member: Member & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs before a member's role is updated
			 *
			 * You can return a `data` object to override the default data.
			 */
			beforeUpdateMemberRole?: (data: {
				member: Member & Record<string, any>;
				newRole: string;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void | {
				data: {
					role: string;
					[key: string]: any;
				};
			}>;

			/**
			 * A callback that runs after a member's role is updated
			 */
			afterUpdateMemberRole?: (data: {
				member: Member & Record<string, any>;
				previousRole: string;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * Invitation hooks
			 */

			/**
			 * A callback that runs before an invitation is created
			 *
			 * You can return a `data` object to override the default data.
			 *
			 * @example
			 * ```ts
			 * beforeCreateInvitation: async (data) => {
			 * 	return {
			 * 		data: {
			 * 			...data.invitation,
			 * 			expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
			 * 		}
			 * 	};
			 * }
			 * ```
			 */
			beforeCreateInvitation?: (data: {
				invitation: {
					email: string;
					role: string;
					organizationId: string;
					inviterId: string;
					teamId?: string;
					[key: string]: any;
				};
				inviter: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void | {
				data: Record<string, any>;
			}>;

			/**
			 * A callback that runs after an invitation is created
			 */
			afterCreateInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				inviter: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs before an invitation is accepted
			 */
			beforeAcceptInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs after an invitation is accepted
			 */
			afterAcceptInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				member: Member & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs before an invitation is rejected
			 */
			beforeRejectInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs after an invitation is rejected
			 */
			afterRejectInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				user: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs before an invitation is cancelled
			 */
			beforeCancelInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				cancelledBy: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;

			/**
			 * A callback that runs after an invitation is cancelled
			 */
			afterCancelInvitation?: (data: {
				invitation: Invitation & Record<string, any>;
				cancelledBy: User & Record<string, any>;
				organization: Organization & Record<string, any>;
			}) => Promise<void>;
	  }
	| undefined;

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

export type InferMember<
	O extends ResolvedOrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["use"][number] extends {
		id: "teams";
	}
		? {
				id: string;
				organizationId: string;
				role: InferOrganizationRolesFromOption<O>;
				createdAt: Date;
				userId: string;
				teamId?: string | undefined;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string | undefined;
				};
			}
		: {
				id: string;
				organizationId: string;
				role: InferOrganizationRolesFromOption<O>;
				createdAt: Date;
				userId: string;
				user: {
					id: string;
					email: string;
					name: string;
					image?: string | undefined;
				};
			}) &
		InferAdditionalFieldsFromPluginOptions<"member", O, isClientSide>
>;

export type InferOrganization<
	O extends ResolvedOrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide>
> &
	(O["disableSlugs"] extends false ? { slug: string } : never);

export type InferInvitation<
	O extends ResolvedOrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["use"][number] extends {
		id: "teams";
	}
		? {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
				teamId?: string | undefined;
			}
		: {
				id: string;
				organizationId: string;
				email: string;
				role: InferOrganizationRolesFromOption<O>;
				status: InvitationStatus;
				inviterId: string;
				expiresAt: Date;
				createdAt: Date;
			}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, isClientSide>
>;

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

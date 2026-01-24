import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import type { DBFieldAttribute, User } from "@better-auth/core/db";
import type { AccessControl, Role } from "../../access";
import type { Invitation, Member, Organization } from "../schema";
import type { Addon } from "./addon";
import type { OrganizationHooks } from "./organization-hooks";

export type ResolvedOrganizationOptions = {
	use: Addon[];
	ac?: AccessControl;
	schema?: OrganizationOptionsSchema;
	hooks?: OrganizationHooks;
	allowUserToCreateOrganization: (user: User) => Awaitable<boolean>;
	organizationLimit: (user: User) => Awaitable<number>;
	creatorRole: string;
	membershipLimit: number;
	disableSlugs: boolean;
	roles: Record<string, Role>;
	defaultOrganizationIdField: "id" | "slug";
	disableOrganizationDeletion: boolean;
	invitationExpiresIn: number;
	invitationLimit: (
		data: {
			user: User & Record<string, any>;
			organization: Organization & Record<string, any>;
			member: Member & Record<string, any>;
		},
		ctx: GenericEndpointContext,
	) => Awaitable<number>;
	cancelPendingInvitationsOnReInvite: boolean;
	requireEmailVerificationOnInvitation: boolean;
	sendInvitationEmail: (
		data: {
			id: string;
			role: string;
			email: string;
			organization: Organization;
			invitation: Invitation;
			inviter: Member & {
				user: User;
			};
		},
		ctx: GenericEndpointContext,
	) => Promise<void>;
};

export type OrganizationOptions = OrgOptions & BaseOptions & InvitationOptions;

type BaseOptions = {
	/**
	 * Organization addons to use.
	 * @example
	 * ```ts
	 * use: [teams(), accessControl()]
	 * ```
	 */
	use?: Addon[];
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

type OrgOptions = {
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
	 * Endpoint parameters or return value's `organizationId` field to reference either `id` or `slug`.
	 *
	 * @default "id"
	 */
	defaultOrganizationIdField?: "id" | "slug";
	/**
	 * Disable organization deletion
	 *
	 * @default false
	 */
	disableOrganizationDeletion?: boolean | undefined;
};

type InvitationOptions = {
	/**
	 * The expiration time for the invitation link.
	 *
	 * @default 48 hours
	 */
	invitationExpiresIn?: number | undefined;
	/**
	 * The maximum invitation a user can send.
	 *
	 * @default 100
	 */
	invitationLimit?:
		| number
		| ((
				data: {
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
					member: Member & Record<string, any>;
				},
				ctx: GenericEndpointContext,
		  ) => Awaitable<number>)
		| undefined;
	/**
	 * Cancel pending invitations on re-invite.
	 *
	 * @default false
	 */
	cancelPendingInvitationsOnReInvite?: boolean | undefined;
	/**
	 * Require email verification on accepting or rejecting an invitation
	 *
	 * @default false
	 */
	requireEmailVerificationOnInvitation?: boolean | undefined;
	/**
	 * Send an email with the
	 * invitation link to the user.
	 *
	 * Note: Better Auth doesn't
	 * generate invitation URLs.
	 * You'll need to construct the
	 * URL using the invitation ID
	 * and pass it to the
	 * acceptInvitation endpoint for
	 * the user to accept the
	 * invitation.
	 *
	 * @example
	 * ```ts
	 * sendInvitationEmail: async (data) => {
	 * 	const url = `https://yourapp.com/organization/
	 * accept-invitation?id=${data.id}`;
	 * 	 sendEmail(data.email, "Invitation to join
	 * organization", `Click the link to join the
	 * organization: ${url}`);
	 * }
	 * ```
	 */
	sendInvitationEmail?:
		| ((
				data: {
					/**
					 * the invitation id
					 */
					id: string;
					/**
					 * the role of the user
					 */
					role: string;
					/**
					 * the email of the user
					 */
					email: string;
					/**
					 * the organization the user is invited to join
					 */
					organization: Organization;
					/**
					 * the invitation object
					 */
					invitation: Invitation;
					/**
					 * the member who is inviting the user
					 */
					inviter: Member & {
						user: User;
					};
				},
				/**
				 * The request object
				 */
				ctx: GenericEndpointContext,
		  ) => Promise<void>)
		| undefined;
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
					[key in keyof Omit<Organization & { slug?: string }, "id">]?: string;
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

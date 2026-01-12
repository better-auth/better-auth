import type { User } from "@better-auth/core/db";
import type { Invitation, Member, Organization } from "../schema";

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

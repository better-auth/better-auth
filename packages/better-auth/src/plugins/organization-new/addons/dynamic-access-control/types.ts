import type { GenericEndpointContext, Prettify } from "@better-auth/core";
import type { DBFieldAttribute, User } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../../db";
import type { Organization } from "../../schema";
import type { FindAddonFromOrgOptions, OrganizationOptions } from "../../types";
import type { OrganizationRole } from "./schema";

export interface DynamicAccessControlOptions {
	hooks?: DynamicAccessControlHooks;
	/**
	 * Configure the role schema
	 */
	schema?:
		| {
				organizationRole?: {
					modelName?: string;
					fields?: {
						[key in keyof Omit<OrganizationRole, "id">]?: string;
					};
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
}

export interface ResolvedDynamicAccessControlOptions
	extends DynamicAccessControlOptions {
	hooks?: DynamicAccessControlHooks;
}

export type InferOrganizationRoleFromOrgOptions<
	O extends OrganizationOptions,
	isClientSide extends boolean = false,
> =
	FindAddonFromOrgOptions<O, "dynamic-access-control"> extends infer T extends
		Record<string, any>
		? T["options"] extends DynamicAccessControlOptions
			? InferOrganizationRole<T["options"], isClientSide>
			: undefined
		: undefined;

export type InferOrganizationRole<
	TO extends DynamicAccessControlOptions,
	isClientSide extends boolean = true,
> = Prettify<
	OrganizationRole &
		InferAdditionalFieldsFromPluginOptions<"organizationRole", TO, isClientSide>
>;

export type DynamicAccessControlHooks =
	| {
			/**
			 * A callback that runs before a role is created
			 *
			 * You can return a `data` object to override the default data.
			 */
			beforeCreateRole?: (
				data: {
					role: {
						role: string;
						organizationId: string;
						permissions: Record<string, string[]>;
						[key: string]: any;
					};
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext | null,
			) => Promise<void | {
				data: Record<string, any>;
			}>;

			/**
			 * A callback that runs after a role is created
			 */
			afterCreateRole?: (
				data: {
					role: OrganizationRole & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext | null,
			) => Promise<void>;

			/**
			 * A callback that runs before a role is updated
			 *
			 * You can return a `data` object to override the default data.
			 */
			beforeUpdateRole?: (
				data: {
					role: OrganizationRole & Record<string, any>;
					updates: {
						role?: string;
						permissions?: Record<string, string[]>;
						[key: string]: any;
					};
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext,
			) => Promise<void | {
				data: Record<string, any>;
			}>;

			/**
			 * A callback that runs after a role is updated
			 */
			afterUpdateRole?: (
				data: {
					role: (OrganizationRole & Record<string, any>) | null;
					user: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext,
			) => Promise<void>;

			/**
			 * A callback that runs before a role is deleted
			 */
			beforeDeleteRole?: (
				data: {
					role: OrganizationRole & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext,
			) => Promise<void>;

			/**
			 * A callback that runs after a role is deleted
			 */
			afterDeleteRole?: (
				data: {
					role: OrganizationRole & Record<string, any>;
					user?: User & Record<string, any>;
					organization: Organization & Record<string, any>;
				},
				ctx: GenericEndpointContext,
			) => Promise<void>;
	  }
	| undefined;

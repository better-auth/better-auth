import type { Prettify } from "@better-auth/core";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import type { UnionToIntersection } from "../../../types";
import type { InferOrganizationRolesFromOption } from "../access";
import type { Organization } from "../schema";
import type { Addon } from "./addon";
import type { OrganizationOptions } from "./organization-options";

/**
 * Extracts and merges all `Infer` types from the addons in `O["use"]`
 */
export type InferFromAddons<O extends OrganizationOptions> =
	O["use"] extends readonly Addon[]
		? UnionToIntersection<
				{
					[K in keyof O["use"]]: O["use"][K] extends Addon
						? O["use"][K]["Infer"] extends Record<string, any>
							? O["use"][K]["Infer"]
							: {}
						: {};
				}[number]
			>
		: {};

export type InferAllAddons<O extends OrganizationOptions> =
	InferFromAddons<O> & {
		Organization: InferOrganization<O>;
		Invitation: InferInvitation<O>;
		Member: InferMember<O>;
	};

export type InferMember<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["use"] extends readonly Addon[]
		? O["use"][number] extends {
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
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide> &
		(O["disableSlugs"] extends true ? {} : { slug: string })
>;

export type InferInvitation<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	(O["use"] extends readonly Addon[]
		? O["use"][number] extends {
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

import type { Prettify } from "@better-auth/core";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import type { InferOrganizationRolesFromOption } from "../access";
import type { Organization } from "../schema";
import type { Addon } from "./addon";
import type {
	OrganizationOptions,
	ResolvedOrganizationOptions,
} from "./organization-options";

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
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide> &
		(O["disableSlugs"] extends false ? { slug: string } : {})
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
		: {}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, isClientSide>
>;

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

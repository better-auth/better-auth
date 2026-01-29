import type { AuthContext, Prettify } from "@better-auth/core";
import type { Endpoint } from "better-call";
import { getSessionFromCtx } from "../../../api";
import type { UnionToIntersection } from "../../../types";
import { shimContext } from "../../../utils/shim";
import type { AcceptInvitation } from "../routes/invitations/accept-invitation";
import { acceptInvitation } from "../routes/invitations/accept-invitation";
import type { CancelInvitation } from "../routes/invitations/cancel-invitation";
import { cancelInvitation } from "../routes/invitations/cancel-invitation";
import type { CreateInvitation } from "../routes/invitations/create-invitation";
import { createInvitation } from "../routes/invitations/create-invitation";
import type { GetInvitation } from "../routes/invitations/get-invitation";
import { getInvitation } from "../routes/invitations/get-invitation";
import type { ListInvitations } from "../routes/invitations/list-invitations";
import { listInvitations } from "../routes/invitations/list-invitations";
import type { ListUserInvitations } from "../routes/invitations/list-user-invitations";
import { listUserInvitations } from "../routes/invitations/list-user-invitations";
import type { RejectInvitation } from "../routes/invitations/reject-invitation";
import { rejectInvitation } from "../routes/invitations/reject-invitation";
import type { CheckOrganizationSlug } from "../routes/organization/check-organization-slug";
import { checkOrganizationSlug } from "../routes/organization/check-organization-slug";
import type { CreateOrganization } from "../routes/organization/create-organizations";
import { createOrganization } from "../routes/organization/create-organizations";
import type { DeleteOrganization } from "../routes/organization/delete-organization";
import { deleteOrganization } from "../routes/organization/delete-organization";
import type { GetFullOrganization } from "../routes/organization/get-full-organization";
import { getFullOrganization } from "../routes/organization/get-full-organization";
import type { GetOrganization } from "../routes/organization/get-organization";
import { getOrganization } from "../routes/organization/get-organization";
import type { ListOrganizations } from "../routes/organization/list-organizations";
import { listOrganizations } from "../routes/organization/list-organizations";
import type { SetActiveOrganization } from "../routes/organization/set-active-organization";
import { setActiveOrganization } from "../routes/organization/set-active-organization";
import type { UpdateOrganization } from "../routes/organization/update-organization";
import { updateOrganization } from "../routes/organization/update-organization";
import type { Addon, OrganizationOptions } from "../types";

type BaseEndpoints<O extends OrganizationOptions> = {
	createOrganization: CreateOrganization<O>;
	checkOrganizationSlug: CheckOrganizationSlug<O>;
	updateOrganization: UpdateOrganization<O>;
	deleteOrganization: DeleteOrganization<O>;
	getFullOrganization: GetFullOrganization<O>;
	getOrganization: GetOrganization<O>;
	setActiveOrganization: SetActiveOrganization<O>;
	listOrganizations: ListOrganizations<O>;
	createInvitation: CreateInvitation<O>;
	getInvitation: GetInvitation<O>;
	listInvitations: ListInvitations<O>;
	listUserInvitations: ListUserInvitations<O>;
	acceptInvitation: AcceptInvitation<O>;
	rejectInvitation: RejectInvitation<O>;
	cancelInvitation: CancelInvitation<O>;
};

export const getEndpoints = <O extends OrganizationOptions>(
	options: O,
): InferOrganizationEndpoints<O> => {
	const addonEndpoints = options.use?.reduce(
		(acc, addon) => {
			return {
				...acc,
				...addon.endpoints,
			};
		},
		{} satisfies Record<string, Endpoint>,
	);

	const endpoints = {
		createOrganization: createOrganization(options),
		checkOrganizationSlug: checkOrganizationSlug(options),
		updateOrganization: updateOrganization(options),
		deleteOrganization: deleteOrganization(options),
		getFullOrganization: getFullOrganization(options),
		getOrganization: getOrganization(options),
		setActiveOrganization: setActiveOrganization(options),
		listOrganizations: listOrganizations(options),
		createInvitation: createInvitation(options),
		getInvitation: getInvitation(options),
		listInvitations: listInvitations(options),
		listUserInvitations: listUserInvitations(options),
		acceptInvitation: acceptInvitation(options),
		rejectInvitation: rejectInvitation(options),
		cancelInvitation: cancelInvitation(options),
		...(addonEndpoints || {}),
	};

	/**
	 * the orgMiddleware type-asserts an empty object representing org options, roles, and a getSession function.
	 * This `shimContext` function is used to add those missing properties to the context object.
	 */
	return shimContext(endpoints, {
		orgOptions: options,
		roles: options.roles,
		getSession: async (context: AuthContext) => {
			return await getSessionFromCtx(context as any);
		},
	}) as InferOrganizationEndpoints<O>;
};

/** Extract endpoints from a single addon, returns empty object if no endpoints */
type ExtractAddonEndpoints<A> = A extends {
	endpoints: infer E extends Record<string, Endpoint>;
}
	? E
	: {};

/** Merge all addon endpoints from the use array into a single intersection */
type MergedAddonEndpoints<Addons extends readonly Addon[]> =
	UnionToIntersection<ExtractAddonEndpoints<Addons[number]>>;

/** Inferred endpoints type from options */
export type InferOrganizationEndpoints<O extends OrganizationOptions> =
	Prettify<
		BaseEndpoints<O> &
			MergedAddonEndpoints<
				O extends { use: readonly Addon[] } ? O["use"] : Addon[]
			>
	>;

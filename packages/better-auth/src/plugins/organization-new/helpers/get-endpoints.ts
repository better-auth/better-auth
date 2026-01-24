import type { AuthContext, Prettify } from "@better-auth/core";
import type { Endpoint } from "better-call";
import { getSessionFromCtx } from "../../../api";
import type { UnionToIntersection } from "../../../types";
import { shimContext } from "../../../utils/shim";
import { acceptInvitation } from "../routes/invitations/accept-invitation";
import { cancelInvitation } from "../routes/invitations/cancel-invitation";
import { createInvitation } from "../routes/invitations/create-invitation";
import { rejectInvitation } from "../routes/invitations/reject-invitation";
import { checkOrganizationSlug } from "../routes/organization/check-organization-slug";
import { createOrganization } from "../routes/organization/create-organizations";
import { deleteOrganization } from "../routes/organization/delete-organization";
import { getFullOrganization } from "../routes/organization/get-full-organization";
import { getOrganization } from "../routes/organization/get-organization";
import { listOrganizations } from "../routes/organization/list-organizations";
import { setActiveOrganization } from "../routes/organization/set-active-organization";
import { updateOrganization } from "../routes/organization/update-organization";
import type { Addon, OrganizationOptions } from "../types";

type BaseEndpoints<O extends OrganizationOptions> = {
	createOrganization: ReturnType<typeof createOrganization<O>>;
	checkOrganizationSlug: ReturnType<typeof checkOrganizationSlug<O>>;
	updateOrganization: ReturnType<typeof updateOrganization<O>>;
	deleteOrganization: ReturnType<typeof deleteOrganization<O>>;
	getFullOrganization: ReturnType<typeof getFullOrganization<O>>;
	getOrganization: ReturnType<typeof getOrganization<O>>;
	setActiveOrganization: ReturnType<typeof setActiveOrganization<O>>;
	listOrganizations: ReturnType<typeof listOrganizations<O>>;
	createInvitation: ReturnType<typeof createInvitation<O>>;
	acceptInvitation: ReturnType<typeof acceptInvitation<O>>;
	rejectInvitation: ReturnType<typeof rejectInvitation<O>>;
	cancelInvitation: ReturnType<typeof cancelInvitation<O>>;
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

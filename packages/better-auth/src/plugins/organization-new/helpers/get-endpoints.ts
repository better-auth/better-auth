import type { AuthContext, Prettify } from "@better-auth/core";
import type { Endpoint } from "better-call";
import { getSessionFromCtx } from "../../../api";
import type { UnionToIntersection } from "../../../types";
import { shimContext } from "../../../utils/shim";
import type { CheckOrganizationSlug } from "../routes/check-organization-slug";
import { checkOrganizationSlug } from "../routes/check-organization-slug";
import type { CreateOrganization } from "../routes/create-organizations";
import { createOrganization } from "../routes/create-organizations";
import type { UpdateOrganization } from "../routes/update-organization";
import { updateOrganization } from "../routes/update-organization";
import type { Addon, OrganizationOptions } from "../types";

/** Base endpoints provided by the organization plugin */
type BaseEndpoints<O extends OrganizationOptions> = {
	createOrganization: CreateOrganization<O>;
	checkOrganizationSlug: CheckOrganizationSlug<O>;
	updateOrganization: UpdateOrganization<O>;
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

import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "../../../api";
import type { Organization } from "../schema";
import type { OrganizationOptions } from "../types";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { getOrgAdapter } from "./get-org-adapter";

/**
 * Resolves the organization ID from the request context.
 *
 * This function determines the organization ID by checking (in order):
 * 1. `organizationId` explicitly provided in the request body
 * 2. `activeOrganizationId` from the user's session
 *
 * If on client, and no session, it will throw UNAUTHORIZED. Session is optional on server.
 * However in the end, an organization id **MUST** be resolved.
 *
 * @param ctx - The endpoint context containing request data and session information
 * @returns A union of either `slug:${string}` or `id:${string}` representing the type of ID used
 * @throws {APIError} `UNAUTHORIZED` - If called from a client without a valid session
 * @throws {APIError} `BAD_REQUEST` with `ORGANIZATION_NOT_FOUND` - If the provided organization ID is invalid
 * @throws {APIError} `BAD_REQUEST` with `NO_ACTIVE_ORGANIZATION` - If no organization ID could be resolved
 */
export const getOrganizationId = async <
	InferOrganization extends Organization,
	ShouldGetOrganization extends boolean = false,
>({
	ctx,
	shouldGetOrganization = false as ShouldGetOrganization,
}: {
	ctx: GenericEndpointContext;
	shouldGetOrganization?: ShouldGetOrganization;
}): Promise<
	ShouldGetOrganization extends true ? InferOrganization : string
> => {
	const options = ctx.context.orgOptions as OrganizationOptions;
	const adapter = getOrgAdapter(ctx.context, options);

	type Extend = { activeOrganizationId?: string };
	const session = await getSessionFromCtx<{}, Extend>(ctx);
	const isClient = ctx.request || ctx.headers;
	if (!session && isClient) throw APIError.fromStatus("UNAUTHORIZED");

	const paramProvidedId: string | undefined =
		ctx?.body?.organizationId || ctx?.query?.organizationId;
	if (paramProvidedId) {
		if (shouldGetOrganization) {
			const organization = await adapter.findOrganizationById(paramProvidedId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			return organization as any;
		}

		const isValid = await adapter.isOrganizationIdValid(paramProvidedId);
		if (!isValid) {
			const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
			throw APIError.from("BAD_REQUEST", msg);
		}
		return paramProvidedId as any;
	}

	const activeOrganizationId = session?.session?.activeOrganizationId;
	if (activeOrganizationId) {
		if (shouldGetOrganization) {
			const organization =
				await adapter.findOrganizationById(activeOrganizationId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			return organization as any;
		}

		const isValid = await adapter.isOrganizationIdValid(activeOrganizationId);
		if (!isValid) {
			const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
			throw APIError.from("BAD_REQUEST", msg);
		}
		return activeOrganizationId as any;
	}

	const msg = ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION;
	throw APIError.from("BAD_REQUEST", msg);
};

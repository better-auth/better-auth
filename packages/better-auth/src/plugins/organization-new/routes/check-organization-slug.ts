import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod/v4";
import { APIError, requestOnlySessionMiddleware } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { getOrgAdapter } from "../helpers/get-org-adapter";
import { orgMiddleware } from "../middleware";
import type { OrganizationOptions } from "../types";

const checkOrganizationSlugBodySchema = z.object({
	slug: z.string().meta({
		description: 'The organization slug to check. Eg: "my-org"',
	}),
});

export type CheckOrganizationSlug<O extends OrganizationOptions> = ReturnType<
	typeof checkOrganizationSlug<O>
>;

export const checkOrganizationSlug = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/check-slug",
		{
			method: "POST",
			body: checkOrganizationSlugBodySchema,
			use: [requestOnlySessionMiddleware, orgMiddleware],
			metadata: {
				openapi: {
					description: "Check if an organization slug is already taken",
					responses: {
						"200": {
							description: "Slug availability status",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											status: {
												type: "boolean",
												description:
													"Whether the slug is available (true if taken)",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			if (options.disableSlugs) {
				const msg = ORGANIZATION_ERROR_CODES.SLUG_IS_NOT_ALLOWED;
				throw APIError.from("FORBIDDEN", msg);
			}
			const orgAdapter = getOrgAdapter<O>(ctx.context, options);
			const isTaken = await orgAdapter.isSlugTaken(ctx.body.slug);
			if (isTaken) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN;
				throw APIError.from("BAD_REQUEST", msg);
			}
			return ctx.json({ status: true });
		},
	);
};

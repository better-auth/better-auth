import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { buildEndpointSchema } from "../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { getOrgAdapter } from "../helpers/get-org-adapter";
import { getUserFromSessionOrBody } from "../helpers/get-user-from-session-or-body";
import { orgMiddleware } from "../middleware/org-middleware";
import type { ResolvedOrganizationOptions } from "../types";

let baseOrganizationSchema = z.object({
	name: z.string().min(1).meta({
		description: "The name of the organization",
	}),
	userId: z.coerce
		.string()
		.meta({
			description:
				'The user id of the organization creator. If not provided, the current user will be used. Should only be used by admins or when called by the server. server-only. Eg: "user-id"',
		})
		.optional(),
	logo: z
		.string()
		.meta({
			description: "The logo of the organization",
		})
		.optional(),
	metadata: z
		.record(z.string(), z.any())
		.meta({
			description: "The metadata of the organization",
		})
		.optional(),
	keepCurrentActiveOrganization: z
		.boolean()
		.meta({
			description:
				"Whether to keep the current active organization active after creating a new one. Eg: true",
		})
		.optional(),
});

export const createOrganization = <O extends ResolvedOrganizationOptions>(
	options: O,
) => {
	const { $Infer, schema } = buildEndpointSchema({
		baseSchema: baseOrganizationSchema,
		additionalFields: {
			schema: options?.schema,
			model: "organization",
		},
		optionalSchema: [
			{
				condition: !options.disableSlugs,
				schema: z.object({
					slug: z.string().min(1).meta({
						description: "The slug of the organization",
					}),
				}),
			},
		],
	});

	return createAuthEndpoint(
		"/organization/create",
		{
			method: "POST",
			body: schema,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					description: "Create an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The organization that was created",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const body = ctx.body;
			const adapter = getOrgAdapter(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			const isClient = ctx.request || ctx.headers;

			// Server-side doesn't require a session, but client-side does.
			if (!session && isClient) throw APIError.fromStatus("UNAUTHORIZED");

			const user = await getUserFromSessionOrBody(ctx);

			// Check if the user is allowed to create an organization
			const canCreateOrg = await options.allowUserToCreateOrganization(user);
			const isSystemAction = !session && body.userId;
			if (!canCreateOrg && !isSystemAction) {
				const msg = ORGANIZATION_ERROR_CODES.NOT_ALLOWED_TO_CREATE_NEW_ORG;
				throw APIError.from("FORBIDDEN", msg);
			}

			// Check if the user has reached the organization limit
			const limit = await options.organizationLimit(user);
			const count = await adapter.countOrganizations(user.id);
			if (count >= limit) {
				const msg = ORGANIZATION_ERROR_CODES.REACHED_ORG_LIMIT;
				throw APIError.from("FORBIDDEN", msg);
			}

			// Check if the slug is already taken
			if (!options.disableSlugs) {
				if (!body.slug) {
					const msg = ORGANIZATION_ERROR_CODES.SLUG_IS_REQUIRED;
					throw APIError.from("BAD_REQUEST", msg);
				}
				const isSlugTaken = await adapter.isSlugTaken(body.slug);
				if (isSlugTaken) {
					const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN;
					throw APIError.from("BAD_REQUEST", msg);
				}
			}
		},
	);
};

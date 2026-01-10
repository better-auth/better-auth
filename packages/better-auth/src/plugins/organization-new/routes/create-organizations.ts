import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { buildEndpointSchema } from "../lib/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../lib/error-codes";
import { getOrgAdapter } from "../lib/get-org-adapter";
import { getUserWithUserIdOrSession } from "../lib/get-user-id-or-session";
import { orgMiddleware } from "../middleware/org-middleware";
import type { ResolvedOrganizationOptions } from "../types";

let baseOrganizationSchema = z.object({
	name: z.string().min(1).meta({
		description: "The name of the organization",
	}),
	slug: z.string().min(1).meta({
		description: "The slug of the organization",
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

function excludeSlug<I, D extends boolean>(options: {
	body: z.ZodObject<
		{
			[x: string]: z.ZodOptional<z.ZodAny>;
		},
		z.core.$strip
	>;
	$Infer: I;
	disableSlugs: D;
}): {
	body: z.ZodObject<
		{
			[x: string]: z.ZodOptional<z.ZodAny>;
		},
		z.core.$strip
	>;
	$Infer: (D extends true ? Omit<I, "slug"> : I) & { test: string };
} {
	const $Infer = {} as any;
	if (options.disableSlugs) {
		return {
			body: options.body.omit({ slug: true }),
			$Infer,
		};
	}
	return {
		body: options.body,
		$Infer,
	};
}

// createOrganization<{ disableSlugs: true }>({ disableSlugs: true })({
// 	body: {},
// });

export const createOrganization = <O extends ResolvedOrganizationOptions>(
	options: O,
) => {
	const disableSlugs = options.disableSlugs as O["disableSlugs"];

	const { $Infer, schema, getBody } = buildEndpointSchema({
		name: "organization",
		schema: options?.schema,
		baseSchema: baseOrganizationSchema,
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
			const body = getBody(ctx);
			const adapter = getOrgAdapter(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			const isClient = ctx.request || ctx.headers;

			// Server-side doesn't require a session, but client-side does.
			if (!session && isClient) throw APIError.fromStatus("UNAUTHORIZED");

			const user = await getUserWithUserIdOrSession(ctx);

			// Check if the user is allowed to create an organization
			const canCreateOrg = await options.allowUserToCreateOrganization(user);
			const isSystemAction = !session && body.userId;
			if (!canCreateOrg && !isSystemAction) {
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION,
				);
			}

			// Check if the user has reached the organization limit
			const limit = await options.organizationLimit(user);
			const count = await adapter.countOrganizations(user.id);
			if (count >= limit) {
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS,
				);
			}

			// Check if the slug is already taken
			if (!disableSlugs) {
				const isSlugTaken = await adapter.isSlugTaken(body.slug);
				if (isSlugTaken) {
					throw APIError.from(
						"BAD_REQUEST",
						ORGANIZATION_ERROR_CODES.ORGANIZATION_SLUG_ALREADY_TAKEN,
					);
				}
			}
		},
	);
};

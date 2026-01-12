import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { buildEndpointSchema } from "../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../helpers/error-codes";
import { getHook } from "../helpers/get-hook";
import { getOrgAdapter } from "../helpers/get-org-adapter";
import { getUserFromSessionOrBody } from "../helpers/get-user-from-session-or-body";
import { orgMiddleware } from "../middleware/org-middleware";
import type { InferOrganization, ResolvedOrganizationOptions } from "../types";

const baseOrganizationSchema = z.object({
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
	type EnableSlugs = O["disableSlugs"] extends true ? false : true;
	const enableSlugs = !options.disableSlugs as EnableSlugs;

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseOrganizationSchema,
		additionalFields: {
			schema: options?.schema,
			model: "organization",
		},
		optionalSchema: [
			{
				condition: enableSlugs,
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
			const body = getBody(ctx);
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
			if (enableSlugs) {
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

			const createOrgHook = getHook("CreateOrganization", options);

			// Prepare organization data
			const organizationData = await (async () => {
				const { keepCurrentActiveOrganization: _, userId: __, ...rest } = body;
				const organization = { ...rest, createdAt: new Date() };
				const modify = await createOrgHook.before({ organization, user });
				return { ...organization, ...modify };
			})();

			// Create the organization
			let organization: InferOrganization<O, false>;
			try {
				organization = await adapter.createOrganization(organizationData);
			} catch (error) {
				ctx.context.logger.error("Failed to create organization:", error);
				const msg = ORGANIZATION_ERROR_CODES.FAILED_TO_CREATE_ORGANIZATION;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			const addMemberHook = getHook("AddMember", options);

			// Prepare member data
			const memberData = await (async () => {
				const member = {
					userId: user.id,
					organizationId: organization.id,
					role: options.creatorRole || "owner",
				};
				const { before } = addMemberHook;
				const modify = await before({ member, organization, user });
				return { ...member, ...modify };
			})();

			// Create the member
			const member = await adapter.createMember(memberData);

			await addMemberHook.after({ member, organization, user });
			await createOrgHook.after({ organization, user, member });

			// Set the active organization
			if (ctx.context.session && !ctx.body.keepCurrentActiveOrganization) {
				const token = ctx.context.session.session.token;
				const organizationId = organization.id;
				await adapter.setActiveOrganization(token, organizationId);
			}

			const metadata: Record<string, any> | undefined = (() => {
				const metadata = organization.metadata;
				if (metadata && typeof metadata === "string") {
					try {
						return JSON.parse(metadata);
					} catch {
						return undefined;
					}
				}
				return metadata;
			})();

			return ctx.json({
				...organization,
				metadata,
				members: [member],
			});
		},
	);
};

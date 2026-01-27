import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { hasPermission } from "../../../access";
import { buildEndpointSchema } from "../../../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { TEAMS_ERROR_CODES } from "../helpers/errors";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { InferTeam, TeamsOptions } from "../types";

const baseTeamSchema = z.object({
	name: z.string().min(1).meta({
		description: "The name of the team",
	}),
	organizationId: z.string().min(1).meta({
		description: "The organization reference ID",
	}),
});

export const createTeam = <O extends TeamsOptions>(
	_options?: O | undefined,
) => {
	const options = resolveTeamOptions(_options);

	type EnableSlugs = O["enableSlugs"] extends true ? true : false;
	const enableSlugs = (options?.enableSlugs ?? false) as EnableSlugs;

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseTeamSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "team",
		optionalSchema: [
			{
				condition: enableSlugs,
				schema: z.object({
					slug: z.string().min(1).meta({
						description: "The slug of the team",
					}),
				}),
			},
		],
	});

	return createAuthEndpoint(
		"/organization/create-team",
		{
			method: "POST",
			body: schema,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					description: "Create a new team within an organization",
					responses: {
						"200": {
							description: "Team created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the created team",
											},
											name: {
												type: "string",
												description: "Name of the team",
											},
											organizationId: {
												type: "string",
												description:
													"ID of the organization the team belongs to",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the team was created",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the team was last updated",
											},
										},
										required: [
											"id",
											"name",
											"organizationId",
											"createdAt",
											"updatedAt",
										],
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
			const session = await getSessionFromCtx(ctx);
			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teamAdapter = getTeamAdapter(ctx.context, options);
			const orgId = await getOrganizationId({ ctx });
			const realOrganizationId = await orgAdapter.getRealOrganizationId(orgId);

			if (session) {
				const userId = session.user.id;
				const IDs = { userId, organizationId: realOrganizationId };
				const member = await orgAdapter.findMemberByOrgId(IDs);

				if (!member) {
					const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("FORBIDDEN", msg);
				}

				const permissions = { team: ["create"] };
				const canCreate = await hasPermission(
					{
						role: member.role,
						options: ctx.context.orgOptions,
						permissions,
						organizationId: realOrganizationId,
					},
					ctx,
				);

				if (!canCreate) {
					const code = "NOT_ALLOWED_TO_CREATE_TEAMS_IN_ORG";
					const msg = ORGANIZATION_ERROR_CODES[code];
					throw APIError.from("FORBIDDEN", msg);
				}
			}

			const existingTeamCount =
				await teamAdapter.getTeamCount(realOrganizationId);
			const maximum = await options.maximumTeams({
				organizationId: realOrganizationId,
				session,
			});

			const maxTeamsReached =
				typeof maximum === "number" ? existingTeamCount >= maximum : false;
			if (maxTeamsReached) {
				const code = "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const { organizationId: _, name, slug, ...additionalFields } = body;

			const org = await orgAdapter.findOrganizationById(realOrganizationId);
			if (!org) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			if (enableSlugs) {
				if (!slug) {
					const code = "SLUG_IS_REQUIRED";
					const msg = TEAMS_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}

				const isSlugTaken = await teamAdapter.isSlugTaken(slug);
				if (isSlugTaken) {
					const code = "SLUG_ALREADY_TAKEN";
					const msg = TEAMS_ERROR_CODES[code];
					throw APIError.from("BAD_REQUEST", msg);
				}
			}

			const teamHook = getHook("CreateTeam", options);

			const teamData = await (async () => {
				const team = {
					name,
					organizationId: realOrganizationId as string,
					createdAt: new Date(),
					updatedAt: new Date(),
					...(enableSlugs ? { slug } : {}),
					...additionalFields,
				} as Omit<InferTeam<O>, "id"> & { slug?: string };

				const response = await teamHook.before({
					organization: org,
					team,
					user: session?.user,
				});

				return { ...team, ...(response || {}) };
			})();

			let team: InferTeam<O, false>;
			try {
				team = await teamAdapter.createTeam(teamData);
			} catch (error) {
				ctx.context.logger.error("Failed to create team:", error);
				const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await teamHook.after({ organization: org, team, user: session?.user });

			return ctx.json(team);
		},
	);
};

import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { hasPermission } from "../../../access";
import { buildEndpointSchema } from "../../../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const baseUpdateTeamSchema = z.object({
	teamId: z.string().meta({
		description: 'The ID of the team to be updated. Eg: "team-id"',
	}),
	data: z.object({
		name: z
			.string()
			.meta({
				description: "The name of the team",
			})
			.optional(),
		organizationId: z
			.string()
			.meta({
				description:
					"The organization ID which the team belongs to. Defaults to the active organization.",
			})
			.optional(),
	}),
});

export const updateTeam = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseUpdateTeamSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "team",
		additionalFieldsNestedAs: "data",
		shouldBePartial: true,
	});

	return createAuthEndpoint(
		"/organization/update-team",
		{
			method: "POST",
			body: schema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					operationId: "updateOrganizationTeam",
					description: "Update an existing team in an organization",
					responses: {
						"200": {
							description: "Team updated successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the updated team",
											},
											name: {
												type: "string",
												description: "Updated name of the team",
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
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = await ctx.context.getSession(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const organization = await getOrganizationId({
				ctx,
				shouldGetOrganization: true,
			});
			const realOrgId = organization.id as RealOrganizationId;

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const canUpdate = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						team: ["update"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canUpdate) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const team = await teamAdapter.findTeamById({
				teamId: body.teamId,
				organizationId: realOrgId,
			});

			if (!team || team.organizationId !== realOrgId.toString()) {
				const code = "TEAM_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const { name, organizationId: __, ...additionalFields } = body.data;

			let updates = {
				name,
				...additionalFields,
			};
			const updateTeamHook = getHook("UpdateTeam", options);

			const modify = await updateTeamHook.before(
				{
					team,
					updates,
					user: session.user,
					organization,
				},
				ctx,
			);

			if (modify) {
				updates = {
					...updates,
					...modify,
				};
			}

			const updatedTeam = await teamAdapter.updateTeam(
				team.id as unknown as RealTeamId,
				updates,
			);

			await updateTeamHook.after(
				{
					team: updatedTeam,
					user: session.user,
					organization,
				},
				ctx,
			);

			return ctx.json(updatedTeam);
		},
	);
};

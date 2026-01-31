import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { setSessionCookie } from "../../../../../cookies";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../../middleware";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const setActiveTeamBodySchema = z.object({
	teamId: z
		.string()
		.meta({
			description:
				"The team id to set as active. It can be null to unset the active team",
		})
		.nullable()
		.optional(),
});

export const setActiveTeam = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/set-active-team",
		{
			method: "POST",
			body: setActiveTeamBodySchema,
			requireHeaders: true,
			use: [orgSessionMiddleware, orgMiddleware],
			metadata: {
				openapi: {
					operationId: "setActiveTeam",
					description: "Set the active team",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The team",
										$ref: "#/components/schemas/Team",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = ctx.context.session;

			if (ctx.body.teamId === null) {
				const sessionTeamId = session.session.activeTeamId;
				if (!sessionTeamId) {
					return ctx.json(null);
				}

				const updatedSession = await adapter.setActiveTeam(
					session.session.token,
					null,
				);

				if (updatedSession !== null) {
					await setSessionCookie(ctx, {
						session: updatedSession,
						user: session.user,
					});
				}

				return ctx.json(null);
			}

			let teamId: string;

			if (!ctx.body.teamId) {
				const sessionTeamId = session.session.activeTeamId;
				if (!sessionTeamId) {
					return ctx.json(null);
				} else {
					teamId = sessionTeamId;
				}
			} else {
				teamId = ctx.body.teamId;
			}

			// Get active organization from session
			const organizationId = session.session.activeOrganizationId;
			if (!organizationId) {
				const code = "NO_ACTIVE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const realOrgId = await adapter.getRealOrganizationId(organizationId);
			const team = await teamAdapter.findTeamById({
				teamId,
				organizationId: realOrgId,
			});

			if (!team) {
				const code = "TEAM_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const member = await teamAdapter.findTeamMember({
				teamId: team.id as unknown as RealTeamId,
				userId: session.user.id,
			});

			if (!member) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const updatedSession = await adapter.setActiveTeam(
				session.session.token,
				team.id as unknown as RealTeamId,
			);

			if (updatedSession !== null) {
				await setSessionCookie(ctx, {
					session: updatedSession,
					user: session.user,
				});
			}

			return ctx.json(team);
		},
	);
};

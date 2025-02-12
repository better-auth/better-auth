import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { APIError } from "better-call";
import { generateId } from "../../../utils";
import { getSessionFromCtx } from "../../../api";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import type { OrganizationOptions } from "../organization";
export const teamSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1, "Team name is required"),
	description: z.optional(z.string().min(1, "Description is required")),
	status: z.string().optional(), // Status of the team
	organizationId: z.string().min(1, "Organization ID is required"),
	createdAt: z.date(),
});

export const createTeam = <O extends OrganizationOptions | undefined>(
	options?: O,
) =>
	createAuthEndpoint(
		"/organization/create-team",
		{
			method: "POST",
			body: z.object({
				organizationId: z.string().optional(),
				data: z.object({
					name: z.string(),
					description: z.string().optional(),
					status: z.string(),
				}),
			}),
			use: [orgMiddleware],
		},
		async (ctx) => {
			const session =
				ctx.body.organizationId || ctx.body.organizationId === null
					? await getSessionFromCtx(ctx)
					: null;
			const organizationId =
				ctx.body.organizationId || session?.session.activeOrganizationId;

			if ((!session && ctx.request) || ctx.headers) {
				throw new APIError("UNAUTHORIZED");
			}

			if (!organizationId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
				});
			}

			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const existingTeams = await adapter.listTeams(organizationId);

			const maximum =
				typeof ctx.context.orgOptions.teams?.maximumTeams === "function"
					? await ctx.context.orgOptions.teams?.maximumTeams(
							{
								organizationId,
								session,
							},
							ctx.request,
						)
					: ctx.context.orgOptions.teams?.maximumTeams;

			const maxTeamsReached = maximum ? existingTeams.length >= maximum : false;
			if (maxTeamsReached) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS,
				});
			}
			const createdTeam = await adapter.createTeam({
				id: generateId(),
				name: ctx.body.data.name,
				description: ctx.body.data.description || "",
				status: ctx.body.data.status,
				organizationId,
				createdAt: new Date(),
			});
			return ctx.json(createdTeam);
		},
	);

export const removeTeam = createAuthEndpoint(
	"/organization/remove-team",
	{
		method: "POST",
		body: z.object({
			teamId: z.string(),
			organizationId: z.string().optional(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId =
			ctx.body.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const team = await adapter.findTeamById(ctx.body.teamId);

		if (!team || team.organizationId !== organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
			});
		}

		if (!ctx.context.orgOptions.teams?.allowRemovingAllTeams) {
			const teams = await adapter.listTeams(organizationId);
			if (teams.length <= 1) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.UNABLE_TO_REMOVE_LAST_TEAM,
				});
			}
		}

		await adapter.deleteTeam(team.id);
		return ctx.json({ message: "Team removed successfully." });
	},
);

export const updateTeam = createAuthEndpoint(
	"/organization/update-team",
	{
		method: "POST",
		body: z.object({
			teamId: z.string(),
			data: teamSchema.partial(),
		}),
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId =
			ctx.body.data.organizationId || session.session.activeOrganizationId;
		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const team = await adapter.findTeamById(ctx.body.teamId);

		if (!team || team.organizationId !== organizationId) {
			throw new APIError("BAD_REQUEST", {
				message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
			});
		}

		const updatedTeam = await adapter.updateTeam(team.id, {
			name: ctx.body.data.name,
			description: ctx.body.data.description,
			status: ctx.body.data.status,
		});

		return ctx.json(updatedTeam);
	},
);

export const getTeam = createAuthEndpoint(
	"/organization/get-team",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
		query: z.object({
			teamId: z.string({
				description: "The team ID to fetch the details of the team",
			}),
		}),
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId = session.session.activeOrganizationId;

		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}

		const { teamId } = ctx.query;
		if (!teamId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: "Team ID is required",
				},
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

		const team = await adapter.findTeamById(teamId);
		if (!team || team.organizationId !== organizationId) {
			return ctx.json(null, {
				status: 404,
				body: {
					message:
						"Team not found or does not belong to the current organization.",
				},
			});
		}

		return ctx.json(team);
	},
);
export const listOrganizationTeams = createAuthEndpoint(
	"/organization/list-teams",
	{
		method: "GET",
		use: [orgMiddleware, orgSessionMiddleware],
	},
	async (ctx) => {
		const session = ctx.context.session;
		const organizationId = session.session.activeOrganizationId;

		if (!organizationId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
		const teams = await adapter.listTeams(organizationId);

		return ctx.json(teams);
	},
);

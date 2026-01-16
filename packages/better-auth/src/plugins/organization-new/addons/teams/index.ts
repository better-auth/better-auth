import type { Addon } from "../../types";
import { createDefaultTeam } from "./create-default-team";
import { TEAMS_ERROR_CODES } from "./errors";
import { resolveTeamOptions } from "./resolve-team-options";
import { createTeam } from "./routes/create-team";
import type { InferTeam, TeamsOptions } from "./types";

export const teams = <O extends TeamsOptions>(_options?: O | undefined) => {
	const options = resolveTeamOptions(_options);
	return {
		id: "teams",
		priority: 10, // Run early to create default teams before other addons
		errorCodes: TEAMS_ERROR_CODES,
		hooks: {
			async afterCreateOrganization({ organization, user }, ctx) {
				return await createDefaultTeam({ user, organization }, ctx, options);
			},
		},
		Infer: {
			Team: {} as InferTeam<O>,
		},
		endpoints: {
			createTeam: createTeam(_options),
		},
		schema: {
			team: {
				modelName: options.schema?.team?.modelName,
				fields: {
					name: {
						type: "string",
						required: true,
						fieldName: options.schema?.team?.fields?.name,
					},
					organizationId: {
						type: "string",
						required: true,
						references: {
							model: "organization",
							field: "id",
						},
						fieldName: options.schema?.team?.fields?.organizationId,
						index: true,
					},
					createdAt: {
						type: "date",
						required: true,
						fieldName: options.schema?.team?.fields?.createdAt,
					},
					updatedAt: {
						type: "date",
						required: false,
						fieldName: options.schema?.team?.fields?.updatedAt,
						onUpdate: () => new Date(),
					},
					...(options.enableSlugs
						? {
								slug: {
									type: "string",
									required: false,
									fieldName: options.schema?.team?.fields?.slug,
								},
							}
						: {}),
					...(options.schema?.team?.additionalFields || {}),
				},
			},
			teamMember: {
				modelName: options.schema?.teamMember?.modelName,
				fields: {
					teamId: {
						type: "string",
						required: true,
						references: {
							model: "team",
							field: "id",
						},
						fieldName: options.schema?.teamMember?.fields?.teamId,
						index: true,
					},
					userId: {
						type: "string",
						required: true,
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options.schema?.teamMember?.fields?.userId,
						index: true,
					},
					createdAt: {
						type: "date",
						required: false,
						fieldName: options.schema?.teamMember?.fields?.createdAt,
					},
				},
			},
		},
	} satisfies Addon<O>;
};

import type { Addon } from "../../types";
import { getTeamAddonSchema } from "..";
import { acceptInvitationForTeams } from "./events/accept-invitation";
import { createDefaultTeam } from "./events/create-default-team";
import { TEAMS_ERROR_CODES } from "./helpers/errors";
import { resolveTeamOptions } from "./helpers/resolve-team-options";
import { addTeamMember } from "./routes/add-team-member";
import { createTeam } from "./routes/create-team";
import { getTeam } from "./routes/get-team";
import { listOrganizationTeams } from "./routes/list-organization-teams";
import { listTeamMembers } from "./routes/list-team-members";
import { listUserTeams } from "./routes/list-user-teams";
import { removeTeam } from "./routes/remove-team";
import { removeTeamMember } from "./routes/remove-team-member";
import { setActiveTeam } from "./routes/set-active-team";
import { updateTeam } from "./routes/update-team";
import type { InferTeam, TeamsOptions } from "./types";

export * from "./schema";

export type TeamsAddon = ReturnType<typeof teams<TeamsOptions>>;

export const teams = <O extends TeamsOptions>(_options?: O | undefined) => {
	const options = resolveTeamOptions(_options);
	return {
		id: "teams",
		priority: 10, // Run early to create default teams before other addons
		errorCodes: TEAMS_ERROR_CODES,
		events: {
			createDefaultTeam,
			acceptInvitationForTeams,
		},
		Infer: {
			Team: {} as InferTeam<O>,
		},
		options,
		endpoints: {
			addTeamMember: addTeamMember(_options),
			createTeam: createTeam(_options),
			getTeam: getTeam(_options),
			listTeams: listOrganizationTeams(_options),
			listTeamMembers: listTeamMembers(_options),
			listUserTeams: listUserTeams(_options),
			removeTeam: removeTeam(_options),
			removeTeamMember: removeTeamMember(_options),
			setActiveTeam: setActiveTeam(_options),
			updateTeam: updateTeam(_options),
		},
		schema: getTeamAddonSchema<O>(options),
	} satisfies Addon<O>;
};

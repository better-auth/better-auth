import type { AuthContext } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type { Organization } from "../../schema";
import type { Addon } from "../../types";
import type { AcceptInvitationForTeamsProps } from "./events/accept-invitation";
import { acceptInvitationForTeams } from "./events/accept-invitation";
import type { AddMemberToTeamProps } from "./events/add-member-to-team";
import { addMemberToTeam } from "./events/add-member-to-team";
import { createDefaultTeam } from "./events/create-default-team";
import type { RemoveMemberFromTeamsProps } from "./events/remove-member-from-teams";
import { removeMemberFromTeams } from "./events/remove-member-from-teams";
import type { ValidateInvitationTeamsProps } from "./events/validate-invitation-teams";
import { validateInvitationTeams } from "./events/validate-invitation-teams";
import type { ValidateTeamForMemberProps } from "./events/validate-team-for-member";
import { validateTeamForMember } from "./events/validate-team-for-member";
import { TEAMS_ERROR_CODES } from "./helpers/errors";
import { getTeamAddonSchema } from "./helpers/get-team-addon-schema";
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
import { updateTeamMember } from "./routes/update-team-member";
import type { InferTeam, InferTeamMember, TeamsOptions } from "./types";

export * from "./schema";
export type {
	InferTeam,
	InferTeamFromOrgOptions,
	InferTeamMember,
	InferTeamMemberFromOrgOptions,
	TeamsOptions,
} from "./types";

export type TeamsAddon = ReturnType<typeof teams<TeamsOptions>>;

export const teams = <O extends TeamsOptions>(_options?: O | undefined) => {
	const options = resolveTeamOptions(_options);
	return {
		id: "teams",
		priority: 10, // Run early to create default teams before other addons
		errorCodes: TEAMS_ERROR_CODES,
		events: {
			async createDefaultTeam(
				props: { organization: Organization; user: User },
				context: AuthContext,
			) {
				return await createDefaultTeam(props, context, options);
			},
			async acceptInvitation(
				props: AcceptInvitationForTeamsProps,
				context: AuthContext,
			) {
				return await acceptInvitationForTeams(props, context, options);
			},
			async validateInvitationTeams(
				props: ValidateInvitationTeamsProps,
				context: AuthContext,
			) {
				return await validateInvitationTeams(props, context, options);
			},
			async validateTeamForMember(
				props: ValidateTeamForMemberProps,
				context: AuthContext,
			) {
				return await validateTeamForMember(props, context, options);
			},
			async addMemberToTeam(props: AddMemberToTeamProps, context: AuthContext) {
				return await addMemberToTeam(props, context, options);
			},
			async removeMemberFromTeams(
				props: RemoveMemberFromTeamsProps,
				context: AuthContext,
			) {
				return await removeMemberFromTeams(props, context, options);
			},
		},
		Infer: {
			Team: {} as InferTeam<O>,
			TeamMember: {} as InferTeamMember<O>,
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
			updateTeamMember: updateTeamMember(_options),
		},
		schema: getTeamAddonSchema<O>(options),
	} satisfies Addon<O>;
};

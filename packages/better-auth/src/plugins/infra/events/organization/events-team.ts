import type { User } from "better-auth";
import type { Organization, Team, TeamMember } from "better-auth/plugins";
import { ORGANIZATION_EVENT_TYPES } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";

export const initTeamEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackOrganizationTeamCreated = (
		organization: Organization,
		team: Team,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_CREATED,
			eventDisplayName: "Organization team created",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				teamId: team.id,
				teamName: team.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationTeamUpdated = (
		organization: Organization,
		team: Team,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_UPDATED,
			eventDisplayName: "Organization team updated",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				teamId: team.id,
				teamName: team.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationTeamDeleted = (
		organization: Organization,
		team: Team,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_DELETED,
			eventDisplayName: "Organization team deleted",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				teamId: team.id,
				teamName: team.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationTeamMemberAdded = (
		organization: Organization,
		team: Team,
		user: User,
		teamMember: TeamMember,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_ADDED,
			eventDisplayName: "User added to organization team",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				teamId: teamMember.teamId,
				teamName: team.name,
				userid: teamMember.userId,
				memberName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationTeamMemberRemoved = (
		organization: Organization,
		team: Team,
		user: User,
		teamMember: TeamMember,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_TEAM_MEMBER_REMOVED,
			eventDisplayName: "User removed from organization team",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				teamId: teamMember.teamId,
				teamName: team.name,
				userid: teamMember.userId,
				memberName: user.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	return {
		trackOrganizationTeamCreated,
		trackOrganizationTeamUpdated,
		trackOrganizationTeamDeleted,

		trackOrganizationTeamMemberAdded,
		trackOrganizationTeamMemberRemoved,
	};
};

import type { User } from "better-auth";
import type { Member, Organization } from "better-auth/plugins";
import { ORGANIZATION_EVENT_TYPES } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";

export const initMemberEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackOrganizationMemberAdded = (
		organization: Organization,
		member: Member,
		user: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ADDED,
			eventDisplayName: "Member added to organization",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				userId: member.userId,
				memberName: user.name,
				role: member.role,
				memberId: member.id,
				memberEmail: user.email,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationMemberRemoved = (
		organization: Organization,
		member: Member,
		user: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_REMOVED,
			eventDisplayName: "Member removed from organization",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				userId: member.userId,
				memberName: user.name,
				role: member.role,
				memberId: member.id,
				memberEmail: user.email,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationMemberRoleUpdated = (
		organization: Organization,
		member: Member,
		user: User,
		previousRole: string,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_ROLE_UPDATED,
			eventDisplayName: "Organization member role updated",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				userId: member.userId,
				memberName: user.name,
				newRole: member.role,
				oldRole: previousRole,
				memberId: member.id,
				memberEmail: user.email,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	return {
		trackOrganizationMemberAdded,
		trackOrganizationMemberRemoved,
		trackOrganizationMemberRoleUpdated,
	};
};

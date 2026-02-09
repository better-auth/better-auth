import type { User } from "better-auth";
import type { Invitation, Member, Organization } from "better-auth/plugins";
import { ORGANIZATION_EVENT_TYPES } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";

export const initInvitationEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackOrganizationMemberInvited = (
		organization: Organization,
		invitation: Invitation,
		inviter: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITED,
			eventDisplayName: "User invited to organization",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				inviteeId: invitation.id,
				inviteeEmail: invitation.email,
				inviteeRole: invitation.role,
				inviteeTeamId: invitation.teamId,
				inviterId: inviter.id,
				inviterName: inviter.name,
				inviterEmail: inviter.email,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationMemberInviteAccepted = (
		organization: Organization,
		invitation: Invitation,
		member: Member,
		acceptedBy: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_ACCEPTED,
			eventDisplayName: "User accepted invite organization invite",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				inviteeId: invitation.id,
				inviteeEmail: invitation.email,
				inviteeRole: invitation.role,
				inviteeTeamId: invitation.teamId,
				acceptedById: acceptedBy.id,
				acceptedByEmail: acceptedBy.email,
				acceptedByName: acceptedBy.name,
				memberId: member.id,
				memberRole: member.role,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationMemberInviteRejected = (
		organization: Organization,
		invitation: Invitation,
		rejectedBy: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_REJECTED,
			eventDisplayName: "User rejected organization invite",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				inviteeId: invitation.id,
				inviteeEmail: invitation.email,
				inviteeRole: invitation.role,
				inviteeTeamId: invitation.teamId,
				rejectedById: rejectedBy.id,
				rejectedByEmail: rejectedBy.email,
				rejectedByName: rejectedBy.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationMemberInviteCanceled = (
		organization: Organization,
		invitation: Invitation,
		cancelledBy: User,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_MEMBER_INVITE_CANCELED,
			eventDisplayName: "Organization invite cancelled",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				inviteeId: invitation.id,
				inviteeEmail: invitation.email,
				inviteeRole: invitation.role,
				inviteeTeamId: invitation.teamId,
				cancelledById: cancelledBy.id,
				cancelledByName: cancelledBy.name,
				cancelledByEmail: cancelledBy.email,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	return {
		trackOrganizationMemberInvited,
		trackOrganizationMemberInviteAccepted,
		trackOrganizationMemberInviteCanceled,
		trackOrganizationMemberInviteRejected,
	};
};

import type { Organization } from "better-auth/plugins";
import { ORGANIZATION_EVENT_TYPES } from "../constants";
import type { EventsTracker, TriggerInfo } from "../types";

export const initOrganizationEvents = (tracker: EventsTracker) => {
	const { trackEvent } = tracker;

	const trackOrganizationCreated = (
		organization: Organization,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_CREATED,
			eventDisplayName: "Organization Created",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	const trackOrganizationUpdated = (
		organization: Organization,
		trigger: TriggerInfo,
	) => {
		trackEvent({
			eventKey: organization.id,
			eventType: ORGANIZATION_EVENT_TYPES.ORGANIZATION_UPDATED,
			eventDisplayName: "Organization Updated",
			eventData: {
				organizationId: organization.id,
				organizationSlug: organization.slug,
				organizationName: organization.name,
				triggeredBy: trigger.triggeredBy,
				triggerContext: trigger.triggerContext,
			},
		});
	};

	return {
		trackOrganizationCreated,
		trackOrganizationUpdated,
	};
};

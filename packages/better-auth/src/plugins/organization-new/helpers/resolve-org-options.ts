import { defaultRoles } from "../access";
import type {
	OrganizationOptions,
	ResolvedOrganizationOptions,
} from "../types";

const DEFAULT_ORGANIZATION_LIMIT = 100;
const DEFAULT_MEMBERSHIP_LIMIT = 100;
const DEFAULT_CREATOR_ROLE = "owner";
const DEFAULT_DISABLE_SLUGS = false;
const DEFAULT_ALLOW_USER_TO_CREATE_ORGANIZATION = true;
const DEFAULT_DISABLE_ORGANIZATION_DELETION = false;
const DEFAULT_DEFAULT_ORGANIZATION_ID_FIELD = "id";
const DEFAULT_INVITATION_EXPIRES_IN = 60 * 60 * 48; // 48 hours in seconds
const DEFAULT_INVITATION_LIMIT = 100;
const DEFAULT_CANCEL_PENDING_INVITATIONS_ON_RE_INVITE = false;
const DEFAULT_REQUIRE_EMAIL_VERIFICATION_ON_INVITATION = false;

export const resolveOrgOptions = <O extends OrganizationOptions>(
	opts?: O | undefined,
) => {
	const roles = opts?.roles ?? {};
	const options = {
		...opts,
		use: opts?.use ?? [],
		creatorRole: opts?.creatorRole ?? DEFAULT_CREATOR_ROLE,
		disableSlugs: opts?.disableSlugs ?? DEFAULT_DISABLE_SLUGS,
		defaultOrganizationIdField:
			opts?.defaultOrganizationIdField ?? DEFAULT_DEFAULT_ORGANIZATION_ID_FIELD,
		disableOrganizationDeletion:
			opts?.disableOrganizationDeletion ??
			DEFAULT_DISABLE_ORGANIZATION_DELETION,
		roles: { ...defaultRoles, ...roles },
		invitationExpiresIn:
			opts?.invitationExpiresIn ?? DEFAULT_INVITATION_EXPIRES_IN,

		cancelPendingInvitationsOnReInvite:
			opts?.cancelPendingInvitationsOnReInvite ??
			DEFAULT_CANCEL_PENDING_INVITATIONS_ON_RE_INVITE,
		requireEmailVerificationOnInvitation:
			opts?.requireEmailVerificationOnInvitation ??
			DEFAULT_REQUIRE_EMAIL_VERIFICATION_ON_INVITATION,
		membershipLimit: async (user, organization, ctx) => {
			if (typeof opts?.membershipLimit === "function") {
				return opts?.membershipLimit(user, organization, ctx);
			} else if (typeof opts?.membershipLimit === "number") {
				return opts?.membershipLimit;
			}
			return DEFAULT_MEMBERSHIP_LIMIT;
		},
		sendInvitationEmail: async (data, ctx) => {
			if (typeof opts?.sendInvitationEmail === "function") {
				await opts?.sendInvitationEmail(data, ctx);
			}
		},
		invitationLimit: (data, ctx) => {
			if (typeof opts?.invitationLimit === "function") {
				return opts?.invitationLimit(data, ctx);
			}
			return opts?.invitationLimit ?? DEFAULT_INVITATION_LIMIT;
		},
		allowUserToCreateOrganization: async (...args) => {
			const allowCreateOrg = opts?.allowUserToCreateOrganization;
			if (typeof allowCreateOrg === "function") {
				const result = await allowCreateOrg(...args);
				return result ?? DEFAULT_ALLOW_USER_TO_CREATE_ORGANIZATION;
			}
			return allowCreateOrg ?? DEFAULT_ALLOW_USER_TO_CREATE_ORGANIZATION;
		},
		organizationLimit: async (...args) => {
			const orgLimit = opts?.organizationLimit;
			if (typeof orgLimit === "function") {
				const result = await orgLimit(...args);
				return result ?? DEFAULT_ORGANIZATION_LIMIT;
			}
			return orgLimit ?? DEFAULT_ORGANIZATION_LIMIT;
		},
	} satisfies ResolvedOrganizationOptions;

	if (options.disableSlugs && options.defaultOrganizationIdField === "slug") {
		throw new Error(
			"[Organization Plugin] Cannot use `slug` as the `defaultOrganizationIdField` when slugs are disabled",
		);
	}

	return options;
};

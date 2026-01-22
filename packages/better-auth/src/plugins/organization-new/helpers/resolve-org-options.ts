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

export const resolveOrgOptions = <O extends OrganizationOptions>(
	opts?: O | undefined,
) => {
	const roles = opts?.roles ?? {};
	const options = {
		...opts,
		use: opts?.use ?? [],
		creatorRole: opts?.creatorRole ?? DEFAULT_CREATOR_ROLE,
		membershipLimit: opts?.membershipLimit ?? DEFAULT_MEMBERSHIP_LIMIT,
		disableSlugs: opts?.disableSlugs ?? DEFAULT_DISABLE_SLUGS,
		defaultOrganizationIdField:
			opts?.defaultOrganizationIdField ?? DEFAULT_DEFAULT_ORGANIZATION_ID_FIELD,
		disableOrganizationDeletion:
			opts?.disableOrganizationDeletion ??
			DEFAULT_DISABLE_ORGANIZATION_DELETION,
		roles: { ...defaultRoles, ...roles },
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
	return options;
};

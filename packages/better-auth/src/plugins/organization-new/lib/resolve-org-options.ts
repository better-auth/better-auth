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

export const resolveOrgOptions = <O extends OrganizationOptions>(
	opts?: O | undefined,
) => {
	const options = {
		...opts,
		use: opts?.use ?? [],
		allowUserToCreateOrganization: async (user) => {
			if (typeof opts?.allowUserToCreateOrganization === "function") {
				return (
					(await opts.allowUserToCreateOrganization(user)) ??
					DEFAULT_ALLOW_USER_TO_CREATE_ORGANIZATION
				);
			}
			return (
				opts?.allowUserToCreateOrganization ??
				DEFAULT_ALLOW_USER_TO_CREATE_ORGANIZATION
			);
		},
		organizationLimit: async (user) => {
			if (typeof opts?.organizationLimit === "function") {
				return (
					(await opts.organizationLimit(user)) ?? DEFAULT_ORGANIZATION_LIMIT
				);
			}
			return opts?.organizationLimit ?? DEFAULT_ORGANIZATION_LIMIT;
		},
		creatorRole: opts?.creatorRole ?? DEFAULT_CREATOR_ROLE,
		membershipLimit: opts?.membershipLimit ?? DEFAULT_MEMBERSHIP_LIMIT,
		disableSlugs: opts?.disableSlugs ?? DEFAULT_DISABLE_SLUGS,
		ac: opts?.ac,
		roles: {
			...defaultRoles,
			...(opts?.roles ?? {}),
		},
		schema: opts?.schema,
	} satisfies ResolvedOrganizationOptions;
	return options;
};

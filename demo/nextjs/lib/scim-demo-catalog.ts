export const SCIM_DEMO_ROLE = "billing-manager";

export const SCIM_DEMO_USER_KEYS = [
	"maya-chen",
	"julian-foster",
	"priya-shah",
] as const;

export const SCIM_DEMO_GROUP_KEYS = [
	"finance-admins",
	"developers",
	"finance-analysts",
] as const;

export type SCIMDemoUserKey = (typeof SCIM_DEMO_USER_KEYS)[number];
export type SCIMDemoGroupKey = (typeof SCIM_DEMO_GROUP_KEYS)[number];

export const SCIM_DEMO_DIRECTORY_USERS = [
	{
		key: "maya-chen",
		displayName: "Maya Chen",
		givenName: "Maya",
		familyName: "Chen",
		emailLocalPart: "maya.chen",
		initials: "MC",
		defaultGroupKey: "finance-admins",
	},
	{
		key: "julian-foster",
		displayName: "Julian Foster",
		givenName: "Julian",
		familyName: "Foster",
		emailLocalPart: "julian.foster",
		initials: "JF",
		defaultGroupKey: "developers",
	},
	{
		key: "priya-shah",
		displayName: "Priya Shah",
		givenName: "Priya",
		familyName: "Shah",
		emailLocalPart: "priya.shah",
		initials: "PS",
		defaultGroupKey: "finance-analysts",
	},
] as const satisfies ReadonlyArray<{
	defaultGroupKey: SCIMDemoGroupKey;
	displayName: string;
	emailLocalPart: string;
	familyName: string;
	givenName: string;
	initials: string;
	key: SCIMDemoUserKey;
}>;

export const SCIM_DEMO_DIRECTORY_GROUPS = [
	{
		key: "finance-admins",
		displayName: "Finance administrators",
		mappedRole: SCIM_DEMO_ROLE,
	},
	{
		key: "developers",
		displayName: "Developers",
		mappedRole: null,
	},
	{
		key: "finance-analysts",
		displayName: "Finance analysts",
		mappedRole: null,
	},
] as const satisfies ReadonlyArray<{
	displayName: string;
	key: SCIMDemoGroupKey;
	mappedRole: string | null;
}>;

export const SCIM_DEMO_GROUP_LABELS = Object.fromEntries(
	SCIM_DEMO_DIRECTORY_GROUPS.map((group) => [group.key, group.displayName]),
) as Record<SCIMDemoGroupKey, string>;

export const SCIM_DEMO_ROLE_MAPPINGS = SCIM_DEMO_DIRECTORY_GROUPS.flatMap(
	(group) =>
		group.mappedRole
			? [
					{
						groupKey: group.key,
						groupDisplayName: group.displayName,
						role: group.mappedRole,
					},
				]
			: [],
);

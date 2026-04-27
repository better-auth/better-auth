/**
 * Generates random role data for testing.
 * Default permissions use valid actions from defaultStatements that the owner role has.
 */
export const getRoleData = (
	overrides: {
		role?: string;
		permissions?: Record<string, string[]>;
		organizationId?: string;
	} = {},
) => {
	const uuid = crypto.randomUUID().slice(0, 8);
	return {
		role: overrides.role ?? `test-role-${uuid}`,
		permissions: overrides.permissions ?? {
			member: ["create"],
		},
		organizationId: overrides.organizationId ?? "",
	};
};

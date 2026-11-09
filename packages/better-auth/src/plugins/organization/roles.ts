/**
 * Splits a role value into a list of trimmed, non-empty role names.
 *
 * Roles are stored as a comma separated string (`"admin,owner"`), and may be
 * submitted either as that string or as an array. Any whitespace around a
 * role name is removed so that `"admin, owner"`, `["admin", " owner"]` and
 * `"admin,owner"` all resolve to the same roles.
 *
 * Every role comparison and every write of a role column must go through this
 * helper (or `parseRoles`), so a padded role name can never be stored in a
 * form that one check matches and another does not.
 */
export function parseRoleList(roles: string | string[]): string[] {
	const list = Array.isArray(roles) ? roles : [roles];
	return list
		.flatMap((role) => role.split(","))
		.map((role) => role.trim())
		.filter(Boolean);
}

/**
 * Normalizes a role value into the comma separated string that is stored in
 * the database. Whitespace around each role name is removed and empty entries
 * are dropped.
 */
export function parseRoles(roles: string | string[]): string {
	return parseRoleList(roles).join(",");
}

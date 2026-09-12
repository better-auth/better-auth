export const parseRoles = (
	role?: string | string[],
	defaultRole?: string | string[],
) => {
	const r = role ?? defaultRole ?? "member";
	return (Array.isArray(r) ? r : [r])
		.flatMap((x) => x.split(","))
		.map((x) => x.trim())
		.filter(Boolean)
		.join(",");
};

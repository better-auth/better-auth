export const getRoleData = (options: {
	organizationId: string;
	role?: string;
	permissions?: Record<string, string[]>;
}) => {
	const random = Math.random().toString(36).substring(2, 15);

	return {
		role: options?.role || `${random}-test-role`,
		permissions: options?.permissions || { member: ["read"] },
		organizationId: options.organizationId,
	};
};

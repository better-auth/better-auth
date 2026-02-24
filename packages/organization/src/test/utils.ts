/**
 * Helper to return random org data for testing.
 */
export const getOrganizationData = (options?: {
	name?: string;
	slug?: string;
}) => {
	const random = Math.random().toString(36).substring(2, 15);
	return {
		name: options?.name || `${random}-test-organization`,
		slug: options?.slug || `${random}-test-organization`,
	};
};

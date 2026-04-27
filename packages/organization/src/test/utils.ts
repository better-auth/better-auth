/**
 * Generates random organization data for testing.
 */
export const getOrganizationData = () => {
	const uuid = crypto.randomUUID().slice(0, 8);
	return {
		name: `Test Org ${uuid}`,
		slug: `test-org-${uuid}`,
	};
};

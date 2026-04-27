/**
 * Generates random organization data for testing.
 * @param overrides - Optional overrides for the generated data.
 */
export const getOrganizationData = (
	overrides?: Partial<{ name: string; slug: string }>,
) => {
	const uuid = crypto.randomUUID().slice(0, 8);
	return {
		name: overrides?.name ?? `Test Org ${uuid}`,
		slug: overrides?.slug ?? `test-org-${uuid}`,
	};
};

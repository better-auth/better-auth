/**
 * Generates random team data for testing.
 */
export const getTeamData = ({ organizationId }: { organizationId: string }) => {
	const uuid = crypto.randomUUID().slice(0, 8);
	return {
		name: `Test Team ${uuid}`,
		organizationId,
	};
};

export const getTeamData = async (options: {
	organizationId: string;
	name?: string;
	slug?: string;
}) => {
	const random = Math.random().toString(36).substring(2, 15);

	return {
		name: options?.name || `${random}-test-team`,
		slug: options?.slug || undefined,
		organizationId: options.organizationId,
	};
};

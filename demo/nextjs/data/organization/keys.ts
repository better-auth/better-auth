export const organizationKeys = {
	all: () => ["organization"] as const,
	invitationDetail: (id: string) =>
		[...organizationKeys.all(), "invitation", id] as const,
};

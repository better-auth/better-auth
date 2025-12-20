export const subscriptionKeys = {
	all: () => ["subscription"] as const,
	list: () => [...subscriptionKeys.all(), "list"] as const,
};

export const userKeys = {
	all: () => ["user"] as const,
	session: () => [...userKeys.all(), "session"] as const,
};

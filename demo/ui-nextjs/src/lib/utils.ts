export const socialProvider = (provider: string) => {
	const env = process.env;
	const PROVIDER = provider.toUpperCase();
	return {
		clientId: env[`${PROVIDER}_CLIENT_ID`]! || "client-id",
		clientSecret: env[`${PROVIDER}_CLIENT_SECRET`]! || "client-secret",
	};
};

import Constants from "expo-constants";

/**
 * Extend this function when going to production by
 * setting the baseUrl to your production API URL.
 */
export const getBaseUrl = () => {
	const debuggerHost = Constants.expoConfig?.hostUri;
	const localhost = debuggerHost?.split(":")[0];

	if (!localhost) {
		// return "https://turbo.t3.gg";
		throw new Error(
			"Failed to get localhost. Please point to your production server.",
		);
	}
	return `http://${localhost}:3000`;
};

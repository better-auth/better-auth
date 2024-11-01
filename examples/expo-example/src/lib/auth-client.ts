import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";

import Constants from "expo-constants";

export const getBaseUrl = () => {
	const debuggerHost = Constants.expoConfig?.hostUri;
	const localhost = debuggerHost?.split(":")[0];
	return `http://${localhost || "localhost"}:8081`;
};

export const authClient = createAuthClient({
	baseURL: getBaseUrl(),
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			scheme: "better-auth",
		}),
	],
});

import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

export const getBaseUrl = () => {
	const debuggerHost = Constants.expoConfig?.hostUri;
	const localhost = debuggerHost?.split(":")[0];
	return `http://${"localhost"}:8081`;
};

export const authClient = createAuthClient({
	baseURL: getBaseUrl(),
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			scheme: "better-auth",
			storage: SecureStore,
		}),
	],
});

import { createAuthClient } from "better-auth/react";
import { expoClient } from "better-auth/client/plugins";
import * as SecureStorage from "expo-secure-store";

export const authClient = createAuthClient({
	baseURL: "http://192.168.1.7:3000",
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			storage: SecureStorage,
			scheme: "better-auth",
		}),
	],
});

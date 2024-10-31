import { createAuthClient } from "better-auth/react";
import { expoClient } from "better-auth/client/plugins";
import * as SecureStorage from "expo-secure-store";
import * as Constant from "expo-constants";
console.log(Constant);
export const authClient = createAuthClient({
	baseURL: "http://172.20.10.3:3000",
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			storage: SecureStorage,
			scheme: "better-auth",
		}),
	],
});

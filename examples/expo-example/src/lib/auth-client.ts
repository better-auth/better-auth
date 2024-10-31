import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStorage from "expo-secure-store";
// import Constant from "expo-constants";
// console.log(Constant);

export const authClient = createAuthClient({
	baseURL: "http://192.168.1.4:3000",
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			scheme: "better-auth",
		}),
	],
});

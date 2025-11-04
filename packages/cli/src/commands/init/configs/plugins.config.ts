import { createImport, type ImportGroup } from "../utility/imports";

export type PluginsConfig = {
	[key: string]: {
		displayName: string;
		auth: {
			function: string;
			imports: ImportGroup[];
		};
		authClient: {
			function: string;
			imports: ImportGroup[];
		} | null;
	};
};

export const pluginsConfig = {
	username: {
		displayName: "Username",
		auth: {
			function: "username",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "username" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "usernameClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "usernameClient" })],
					isNamedImport: false,
				},
			],
		},
	},
	twoFactor: {
		displayName: "Two Factor",
		auth: {
			function: "twoFactor",
			imports: [
				{
					path: "better-auth/plugins",
					imports: [createImport({ name: "twoFactor" })],
					isNamedImport: false,
				},
			],
		},
		authClient: {
			function: "twoFactorClient",
			imports: [
				{
					path: "better-auth/client/plugins",
					imports: [createImport({ name: "twoFactorClient" })],
					isNamedImport: false,
				},
			],
		},
	},
} satisfies PluginsConfig;

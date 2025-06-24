import { BetterAuthClientPlugin } from "better-auth";

type passwordPlugin = typeof passwordPlugin;

export const birthdayClientPlugin = () => {
	return {
		id: "birthdayPlugin",
		$InferServerPlugin: {} as ReturnType<passwordPlugin>,
	} satisfies BetterAuthClientPlugin;
};

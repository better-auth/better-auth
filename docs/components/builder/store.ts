import { atom } from "jotai";

export const optionsAtom = atom({
	email: true,
	passkey: false,
	socialProviders: ["google", "github"],
	magicLink: false,
	signUp: true,
	label: true,
	rememberMe: true,
	requestPasswordReset: true,
	legal: false,
	legalDocuments: [] as {
		url: string;
		name: string;
		view: boolean;
		accept: boolean;
	}[],
});

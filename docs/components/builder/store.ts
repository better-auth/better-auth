import { atom } from "jotai";

export type SignInBoxOptions = typeof defaultOptions;

export const defaultOptions = {
	email: true,
	passkey: false,
	socialProviders: ["google", "github"],
	magicLink: false,
	signUp: true,
	label: true,
	rememberMe: true,
	requestPasswordReset: true,
};

export const optionsAtom = atom(defaultOptions);

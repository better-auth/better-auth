import { atom } from "jotai";
import * as z from "zod";

export const signInBoxOptionsSchema = z.object({
  email: z.boolean(),
  passkey: z.boolean(),
  socialProviders: z.string().array(),
  magicLink: z.boolean(),
  signUp: z.boolean(),
  label: z.boolean(),
  rememberMe: z.boolean(),
  requestPasswordReset: z.boolean(),
});

signInBoxOptionsSchema.default

export type SignInBoxOptions = z.infer<typeof signInBoxOptionsSchema>;

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

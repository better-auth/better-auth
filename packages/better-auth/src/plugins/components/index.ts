// import { generateForm, h } from "@better-auth/components";
//import type { BetterAuthPlugin } from "@better-auth/core";
import type { BetterAuthClientPlugin } from "../../../../core/src";
import type { ZodType } from "zod";
import type { SignInMethodConfig } from "./config";

type Options = {
	forgotPassword?: {
		callbackURL?: string;
	};
	emailAndPassword?: {
		enabled?: boolean;
		disableSignUp?: boolean;
		passwordSchema?: ZodType;

	}
};
const defaultOptions = {
  forgotPassword: {
    callbackURL: "/reset-password",
  }
} satisfies Options;

function emailAndPasswordForm(signIn, forgotPassword: string): SignInMethodConfig<"form"> {
	return {
		type: "form",
		options: {
			fields: [
				{
					label: "Email",
					id: "email",
					props: {
						placeholder: "m@example.com",
						required: true,
						type: "email",
					},
					field: "input",
				},
				{
					label: "Password",
					id: "password",
					field: "input",
					props: {
						id: "password",
						type: "password",
						placeholder: "password",
						autoComplete: "password",
					},
				},
			],
			button: {
				label: "Login",
				endpoint: async (data) =>
					await signIn({
						/**
						 * The user email
						 */
						email: data.email,
						/**
						 * The user password
						 */
						password: data.password,
						/**
						 * A URL to redirect to after the user verifies their email (optional)
						 */
						callbackURL: "/dashboard",
						/**
						 * remember the user session after the browser is closed.
						 * @default true
						 */
						rememberMe: false,
					}),
				props: {
					className: "w-full",
				},
			},
		},
	};
}

export function componentClient(options: Options = defaultOptions) {
	return {
		id: "components",
		components: {
			signIn: [
				{
					methods: [(client) => emailAndPasswordForm(client.signIn.email, "/forgot-password")],
					footer: {
						elms: [],
						className: "",
						styles: {},
					},
					title: { text: "Sign In", className: "", styles: {} },
					description: {
						text: "Enter your email below to login to your account",
						className: "",
						styles: {},
					},
					styles: {
						root: {
							className: "",
							styles: {},
						},
						main: {
							className: "",
							styles: {},
						},
					},
				},
			],
		},
	} satisfies BetterAuthClientPlugin;
}

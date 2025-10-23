//import type { Options } from "@better-auth/components/methods/form";
import type { Options } from "../../../../components/src/methods/form";
import type { createAuthClient } from "../../client";


export type Methods = "form";

export type SignInConfig = {
	methods: SignInMethod<Methods>[];
	footer: {
		elms: { node: React.ReactNode; bulletPoint: boolean }[];
		className: string;
		styles: React.CSSProperties;
	};
	title: { text: string; className: string; styles: React.CSSProperties };
	description: {
		text: string;
		className: string;
		styles: React.CSSProperties;
	};
	styles: {
		root: {
			className: string;
			styles: React.CSSProperties;
		};
		main: {
			className: string;
			styles: React.CSSProperties;
		};
	};
};

export type ComponentPluginConfig = {
	signIn: SignInConfig;
	signUp: SignInConfig;
};

export type SignInMethod<T extends Methods> =
		| SignInMethodConfig<T>
		| ((
				auth: ReturnType<typeof createAuthClient>,
		  ) => SignInMethodConfig<T>
    );

export type AllOptions = {
	form: Options
}

export type SignInMethodConfig<T extends Methods> = {
		type: T;
		options: AllOptions[T];
};
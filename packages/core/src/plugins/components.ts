import type { AuthEndpoint } from "../middleware";

export type ComponentPluginConfig = {
	signIn: {
		methods: SignInMethod[];
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
	signUp: { methods: SignUpMethod[] };
};

type BaseMethod = {
	name: string;
	group: string;
};
export type NodeMethod = {
	node: React.ReactNode;
} & BaseMethod;
export type Node<
	T extends "input" | "button",
	N extends
		| React.HTMLProps<HTMLInputElement>
		| React.HTMLProps<HTMLButtonElement> = T extends "input"
		? React.HTMLProps<HTMLInputElement>
		: React.HTMLProps<HTMLButtonElement>,
> = {
	element: T;
	node: N;
} & (T extends "button"
	? {
			endpoint: AuthEndpoint;
		}
	: {});
export type FormMethod = {
	form: Node<"button" | "input">[];
} & BaseMethod;

export type SignInMethod = NodeMethod | FormMethod;
type SignUpMethod = {
	node?: React.ReactNode;
	form?: Record<
		string,
		| React.HTMLProps<HTMLInputElement>
		| (React.HTMLProps<HTMLButtonElement> & { node: "button" | "input" })
	>;
	name: string;
};

type Hook<ctx> = {
	matcher: (ctx: ctx) => boolean;
	handler: (ctx: ctx) => void;
};

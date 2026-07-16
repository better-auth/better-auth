import type {
	ClientEffect,
	UIActionDescriptor as CoreUIActionDescriptor,
	UIComponent,
	UIPage,
	UIPrimitive,
} from "@better-auth/core";

export type UIChild =
	| UIComponent
	| string
	| number
	| boolean
	| null
	| undefined
	| UIChild[];

export type AuthUIRoute = Extract<
	CoreUIActionDescriptor,
	{ type: "auth-route" }
>;

export type ServerUIAction = Extract<
	CoreUIActionDescriptor,
	{ type: "server-action" }
>;

export type UIActionDescriptor = CoreUIActionDescriptor | string;

export type BetterAuthUIEffect =
	| ClientEffect
	| {
			type: "toastFromError";
			fallback: string;
	  }
	| {
			type: "set";
			key: string;
			value: UIPrimitive;
	  };

export type EffectInput = BetterAuthUIEffect | BetterAuthUIEffect[] | undefined;

export type ComponentProps = Record<string, unknown> & {
	children?: UIChild | undefined;
};

export type UIPageInput = UIPage;

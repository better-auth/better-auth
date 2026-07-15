import type { AuthContext } from "./context";
import type { Awaitable, LiteralString, LiteralUnion } from "./helper";
import type { BetterAuthOptions } from "./init-options";

export type UIPrimitive =
	| string
	| number
	| boolean
	| null
	| undefined
	| UIPrimitive[]
	| { [key: string]: UIPrimitive };

export type UIComponentTag = LiteralUnion<
	| "a"
	| "alert"
	| "badge"
	| "button"
	| "card"
	| "div"
	| "empty-state"
	| "form"
	| "h1"
	| "h2"
	| "h3"
	| "input"
	| "label"
	| "li"
	| "main"
	| "modal"
	| "nav"
	| "option"
	| "p"
	| "picture"
	| "script"
	| "section"
	| "select"
	| "source"
	| "span"
	| "stat"
	| "style"
	| "table"
	| "tabs"
	| "tbody"
	| "td"
	| "textarea"
	| "th"
	| "thead"
	| "tr"
	| "ul",
	string
>;

export type UICondition =
	| boolean
	| {
			bind: string;
			equals?: UIPrimitive;
			not?: UIPrimitive;
	  };

export type UIAction =
	| {
			type: "server";
			id: string;
			params?: Record<string, UIPrimitive>;
	  }
	| {
			type: "client";
			name: string;
			params?: Record<string, UIPrimitive>;
	  }
	| {
			type: "navigate";
			to: string;
	  };

export type UIActionDescriptor =
	| {
			type: "auth-route";
			path: string;
			method: "GET" | "POST";
	  }
	| {
			type: "server-action";
			id: string;
			method: "POST";
	  };

export type UIProps = Record<
	string,
	UIPrimitive | UIAction | UIAction[] | undefined
>;

export type UIComponent = {
	tag: UIComponentTag;
	props?: UIProps | undefined;
	children?: (UIComponent | string | number | boolean | null | undefined)[];
	when?: UICondition | undefined;
	bind?: string | undefined;
	on?: Record<string, UIAction> | undefined;
};

export type ClientEffect =
	| {
			type: "redirect";
			url: string;
	  }
	| {
			type: "toast";
			level?: "info" | "success" | "warning" | "error";
			message: string;
	  }
	| {
			type: "replace";
			target: string;
			component: UIComponent;
	  }
	| {
			type: "reload";
	  }
	| {
			type: "show";
			target: string;
	  }
	| {
			type: "hide";
			target: string;
	  }
	| {
			type: "openDialog";
			target: string;
	  }
	| {
			type: "closeDialog";
			target: string;
	  };

export type UIPluginCapability = {
	id: LiteralString;
	enabled?: boolean | undefined;
	routes?: Record<string, UIActionDescriptor> | undefined;
	metadata?: Record<string, UIPrimitive> | undefined;
};

export type UIContext<Options extends BetterAuthOptions = BetterAuthOptions> = {
	context: AuthContext<Options>;
	request: Request;
	path: string;
	params: Record<string, string>;
	query: URLSearchParams;
	theme: ThemeConfig;
	slots: (slot: string) => UIExtension[];
	capability: <T extends UIPluginCapability = UIPluginCapability>(
		id: string,
	) => T | null;
	hasCapability: (id: string) => boolean;
	plugins: {
		has: (id: string) => boolean;
	};
};

export type UIMiddleware<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = (ctx: UIContext<Options>) => Awaitable<Response | void>;

export type UIPage<Options extends BetterAuthOptions = BetterAuthOptions> = {
	id: LiteralString;
	path: string;
	title: string;
	icon?: string | undefined;
	group?: string | undefined;
	render: (ctx: UIContext<Options>) => Awaitable<UIComponent>;
	middleware?: UIMiddleware<Options>[] | undefined;
};

export type UIExtension<Options extends BetterAuthOptions = BetterAuthOptions> =
	{
		id: LiteralString;
		slot: LiteralString;
		priority?: number | undefined;
		render: (ctx: UIContext<Options>) => Awaitable<UIComponent>;
	};

export type UIPluginConfig<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = {
	pages?: Record<string, UIPage<Options>> | undefined;
	slots?: Record<string, UIExtension<Options>[]> | undefined;
	capabilities?: Record<string, UIPluginCapability> | undefined;
	middleware?:
		| {
				path: string;
				middleware: UIMiddleware<Options>;
		  }[]
		| undefined;
};

export type ThemeLogoUrl =
	| string
	| {
			dark: string;
			light: string;
	  };

export type ThemeLogoPlacement =
	| "hidden"
	| "top-left"
	| "top-center"
	| "top-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right";

export type ThemeConfig = {
	logoUrl?: ThemeLogoUrl | undefined;
	logoPlacement?: ThemeLogoPlacement | undefined;
	appName?: string | undefined;
	primary: string;
	background: string;
	surface: string;
	text: string;
	textSecondary: string;
	border: string;
	error: string;
	success: string;
	fontFamily?: string | undefined;
	fontSize?: "sm" | "md" | "lg" | undefined;
	borderRadius?: "none" | "sm" | "md" | "lg" | "full" | undefined;
	/**
	 * Dark-mode color overrides. Applied automatically when the user's
	 * system preference is `prefers-color-scheme: dark`.
	 */
	dark?: Partial<Omit<ThemeConfig, "dark">> | undefined;
};

export type UIContentSecurityPolicyOptions = {
	scriptSrc?: string[] | undefined;
	styleSrc?: string[] | undefined;
	imgSrc?: string[] | undefined;
	connectSrc?: string[] | undefined;
};

export type BetterAuthUIOptions = {
	basePath?: string | undefined;
	background?: string | undefined;
	defaultRedirectTo?: string | undefined;
	theme?: Partial<ThemeConfig> | undefined;
	/**
	 * Optional Terms of Service URL. When set, sign-in and sign-up pages
	 * show a legal notice linking to this policy.
	 */
	termsOfServiceURL?: string | undefined;
	/**
	 * Optional Privacy Policy URL. When set, sign-in and sign-up pages
	 * show a legal notice linking to this policy.
	 */
	privacyPolicyURL?: string | undefined;
	csp?: false | UIContentSecurityPolicyOptions | undefined;
};

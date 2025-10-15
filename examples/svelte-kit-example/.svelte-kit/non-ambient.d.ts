
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/(protected)" | "/" | "/(protected)/dashboard" | "/forget-password" | "/reset-password" | "/sign-in" | "/sign-up";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/(protected)": Record<string, never>;
			"/": Record<string, never>;
			"/(protected)/dashboard": Record<string, never>;
			"/forget-password": Record<string, never>;
			"/reset-password": Record<string, never>;
			"/sign-in": Record<string, never>;
			"/sign-up": Record<string, never>
		};
		Pathname(): "/" | "/dashboard" | "/dashboard/" | "/forget-password" | "/forget-password/" | "/reset-password" | "/reset-password/" | "/sign-in" | "/sign-in/" | "/sign-up" | "/sign-up/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | string & {};
	}
}
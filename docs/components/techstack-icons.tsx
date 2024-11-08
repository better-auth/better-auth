import { Icons } from "./icons";
type TechStackIconType = {
	[key: string]: {
		name: string;
		icon: any;
	};
};
export const techStackIcons: TechStackIconType = {
	nextJs: {
		name: "Nextjs",
		icon: <Icons.nextJS className="w-10 h-10" />,
	},
	nuxt: {
		name: "Nuxt",
		icon: <Icons.nuxt className="w-10 h-10" />,
	},
	svelteKit: {
		name: "Svelte Kit",
		icon: <Icons.svelteKit className="w-10 h-10" />,
	},
	solidStart: {
		name: "Solid Start",
		icon: <Icons.solidStart className="w-10 h-10" />,
	},
	react: {
		name: "React",
		icon: <Icons.react className="w-10 h-10" />,
	},
	hono: {
		name: "Hono",
		icon: <Icons.hono className="w-10 h-10" />,
	},
	astro: {
		name: "Astro",
		icon: <Icons.astro className="w-10 h-10" />,
	},
	tanstack: {
		name: "TanStack Start",
		icon: <Icons.tanstack className="w-10 h-10" />,
	},
	expo: {
		name: "Expo",
		icon: <Icons.expo className="w-10 h-10" />,
	},
};

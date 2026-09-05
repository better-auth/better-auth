import { authenticationIcons } from "./authentication";
import { brandIcons } from "./brands";
import { pageIcons } from "./pages";
import { pluginIcons } from "./plugins";
import { sectionIcons } from "./sections";

export const Icons = {
	...brandIcons,
	...sectionIcons,
	...authenticationIcons,
	...pluginIcons,
	...pageIcons,
} as const;

export type IconKey = keyof typeof Icons;

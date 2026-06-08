import type { UIPage } from "@better-auth/core";

export type {
	ClientEffect,
	UIAction,
	UIComponent,
	UICondition,
	UIContext,
	UIExtension,
	UIMiddleware,
	UIPage,
	UIPluginConfig,
	UIProps,
} from "@better-auth/core";
export { createRoute, routes, serverAction } from "./actions";
export { backgrounds } from "./backgrounds";
export {
	Button,
	Card,
	Dialog,
	Form,
	Input,
	Link,
	Show,
	Text,
} from "./components";
export { effects } from "./effects";
export type { UIStateRef } from "./state";
export { state, when } from "./state";
export type {
	AuthUIRoute,
	BetterAuthUIEffect,
	EffectInput,
	ServerUIAction,
	UIActionDescriptor,
	UIChild,
	UIPageInput,
} from "./types";

export function createUIPage<Page extends UIPage>(page: Page) {
	return page;
}

import type { UIComponent, UIComponentTag } from "@better-auth/core";
import type { ComponentProps, UIChild } from "./types";

export const Fragment = Symbol.for("better-auth.ui.fragment");

function flattenChildren(
	children: UIChild | undefined,
): Exclude<UIChild, UIChild[]>[] {
	if (children === undefined) return [];
	if (Array.isArray(children)) {
		return children.flatMap((child) => flattenChildren(child));
	}
	return [children];
}

function normalizeProps(props: ComponentProps | null | undefined) {
	if (!props) return {};
	const { children: _children, ...rest } = props;
	return rest as UIComponent["props"];
}

export function jsx(
	type: UIComponentTag | typeof Fragment | ((props: never) => UIComponent),
	props: ComponentProps | null,
): UIComponent {
	if (typeof type === "function") {
		return type({
			...(props ?? {}),
			children: flattenChildren(props?.children),
		} as never);
	}
	const children = flattenChildren(props?.children);
	if (type === Fragment) {
		return {
			tag: "fragment",
			children,
		};
	}
	return {
		tag: type,
		props: normalizeProps(props),
		children,
	};
}

export const jsxs = jsx;

export namespace JSX {
	export type Element = UIComponent;
	export type ElementType =
		| UIComponentTag
		| typeof Fragment
		| ((props: never) => UIComponent);
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicElements {
		[tagName: string]: Record<string, unknown> & {
			children?: UIChild | undefined;
		};
	}
}

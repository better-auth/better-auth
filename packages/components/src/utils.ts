import type {
	Element,
	Properties,
	PropertiesWithId,
	Root,
	StandardNode,
} from "./hast";

export function createElement(
	element: string,
	props?: Properties,
	children?: StandardNode[],
	live?: false,
): Element<false>;
export function createElement(
	element: string,
	props: PropertiesWithId,
	children: StandardNode[],
	live: true,
): Element<true>;
export function createElement(
	element: string,
	props: Properties | PropertiesWithId = {},
	children: StandardNode[] = [],
	live: true | false = false,
): Element<true> | Element<false> {
	return {
		type: "element",
		tagName: element,
		properties: props,
		children: children,
		live,
	} as Element<true> | Element<false>;
}

export const h = createElement;
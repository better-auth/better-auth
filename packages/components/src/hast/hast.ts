import type {
	Literal as UnistLiteral,
	Parent as UnistParent,
	Node as UnistNode,
} from "./unist";

export interface Literal extends UnistLiteral {
	value: string;
}
export interface Parent extends UnistParent {
	children: Node[];
}
export interface Comment extends Literal {
	type: "comment";
}
export interface Doctype extends UnistNode {
	type: "doctype";
}
export interface Element<T extends true | false> extends Parent {
	type: "element";
	tagName: string;
	properties: T extends false ? Properties : PropertiesWithId;
	children: StandardNode[];

	// Custom properties:
	/**
	 * Whether the element needs to be stateful or not
	 */
	live: T;
}

export interface Root extends Parent {
	type: "root";
}
export interface Text extends Literal {
	type: "text";
}
export type Properties = { [key: string]: any };
export type PropertiesWithId = {
	[key in string | "id"]: any;
};
export type Node = Comment | Doctype | Element<true> | Element<false> | Text;
export type StandardNode = Comment | Element<true> | Element<false> | Text;

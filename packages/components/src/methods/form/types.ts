import type { Element, Properties, PropertiesWithId } from "../../hast";

export type SpecialInfo = {
	options: {
		id: string;
		label: string;
		props?: Properties;
	}[];
	props?: Properties;
};

export type OTPSpecialInfo = {
	options: {
		id: string;
		type: "group" | "separator";
		props?: Properties;
		slots?: {
			id?: number;
			props?: Properties;
		}[];
	}[];
	props?: Properties;
};

export type SelectSpecialInfo = {
	options: {
		id: string;
		type: "group" | "separator" | "item";
		props?: Properties;
		items?: {
			id: string;
			props?: Properties;
			type: "item" | "separator";
		}[];
	}[];
	props?: Properties;
};

export const specialFields = {
	radio: "radioItem",
	select: "select",
	selectGroup: "selectGroup",
	selectItem: "selectItem",
	selectSeparator: "selectSeparator",
	otp: "otp", // ONLY USED TO FORCE SPECIAL CASE
	otpGroup: "otpGroup",
	otpSlot: "otpSlot",
	otpSeparator: "otpSeparator",
	button: "button",
} as const;

export const fieldTypes = [
	"input",
	"checkbox",
	"calender",
	"otp",
	"radio",
	"slider",
	"select",
	"switch",
	"button",
] as const;

export type Options = {
	fields: Field<(typeof fieldTypes)[number]>[];
	button: {
		label: string;
		endpoint: (data: any) => void;
		props: Omit<PropertiesWithId, "type" | "onClick" | "children">;
	};
	/**
	 * These plugins will be used to render the form
	 *
	 * They will always be enabled for this form
	 *
	 * @default []
	 */
	plugins?: FormPlugin[];
};

export type FormPlugin = {
	field: string;
	location: {
		reference: "label" | "input" | "outside" | "inside" | "element";
		/**
		 * Valid values:
		 *
		 * Reference ===:
		 * - "label" | "input" = "before" | "after" | "element"
		 * - "outside" = "before" | "after"
		 * - "inside" = "before" | "after" | "between"
		 *
		 * If location is "element", the element is edited
		 * If `node.element` is defined, the element is replaced
		 */
		location: "before" | "after" | "element" | "between";
	};
	node: {
		/**
		 * Only valid if reference is "element"
		 */
		text?: string;
		/**
		 * The entire element
		 *
		 * Can be overridden by later plugins when reference is "element"
		 */
		element?: Element<true> | Element<false>;
	};
}
export type HookMatcherContext = Omit<Field<(typeof fieldTypes)[number]>, "hooks"> & {
		plugins: FormPlugin[];
	};
export type HookContext = {
	oldValue: any;
	newValue: any;
	setDisabled: (id: string, val: boolean) => void;
	setValue: (id: string, val: any) => void;
	setProp: (id: string, key: string, val: any) => void;
	getElement: (id: string) => Element<boolean> | undefined;
};
export type Field<T extends (typeof fieldTypes)[number]> = {
	label: string;
	id: string;
	props?: Properties &
		(T extends "button" ? { endpoint: (data: any) => void } : {});
	field: T;
	extra?: T extends "otp"
		? OTPSpecialInfo
		: T extends "select"
			? SelectSpecialInfo
			: T extends keyof typeof specialFields
				? SpecialInfo
				: never;
	hooks?: {
		register: (ctx: HookMatcherContext) => string[];
		before: (ctx: HookMatcherContext) => void;
		after: (ctx: HookMatcherContext) => void;
	};
	defaultValue?: any;
};
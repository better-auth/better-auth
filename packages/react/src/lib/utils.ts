import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Element, Text } from "@better-auth/components/hast";
import { jsx, jsxs } from "react/jsx-runtime";
import { fieldTypes } from "../constants";
import * as React from "react";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

function filterMap<R, T>(
	array: T[],
	callbackfn: (value: T, index: number, array: T[]) => R | undefined,
): R[] {
	const result = [];
	for (let i = 0; i < array.length; i++) {
		const value = callbackfn(array[i]!, i, array);
		if (value !== undefined) {
			result.push(value);
		}
	}
	return result;
}

export function hastToReact(
	hast: Element<true | false> | Text,
	[data, setData]: [Record<string, any>, (update: [string, any]) => void],
	disabled: boolean,
): React.ReactElement | string {
	console.log("ELEMENT", hast);
	if (hast.type === "text") {
		return hast.value as string;
	}

	// Determine the React element to render for this tag
	const elm: React.ElementType =
		hast.tagName === "fragment"
			? React.Fragment
			: hast.tagName in fieldTypes
				? (fieldTypes[
						hast.tagName as keyof typeof fieldTypes
					] as unknown as React.ElementType)
				: (hast.tagName as unknown as React.ElementType);

	// Compute props
	let baseProps: Record<string, any> = { ...(hast.properties as any) };
	if ((baseProps as any).class !== undefined) {
		const { class: klass, ...rest } = baseProps as any;
		(baseProps as any) = { ...rest, className: klass };
	}
	// Only apply disabled to elements that understand it
	if (disabled) {
		if (
			[
				"input",
				"checkbox",
				"switch",
				"slider",
				"radio",
				"select",
				"otp",
			].includes(hast.tagName)
		) {
			baseProps.disabled = true;
		}
	}

	// Wire live bindings when applicable
	if ((hast as Element<boolean>).live) {
		const id = (hast as Element<true>).properties.id;
		switch (hast.tagName) {
			case "input": {
				baseProps.value = data[id] ?? "";
				baseProps.onChange = (e: React.ChangeEvent<any>) => {
					const next =
						(e as any)?.currentTarget?.value ?? (e as any)?.target?.value;
					setData([id, next]);
				};
				break;
			}
			case "checkbox":
			case "switch": {
				baseProps.checked = Boolean(data[id]);
				baseProps.onCheckedChange = (val: boolean) => {
					setData([id, Boolean(val)]);
				};
				break;
			}
			case "slider":
			case "calendar":
			case "radio":
			case "select": {
				baseProps.value = data[id];
				baseProps.onValueChange = (
					val: string | number | Date | number[] | undefined,
				) => {
					setData([id, val]);
				};
				break;
			}
			case "otp": {
				baseProps.value = data[id] ?? "";
				baseProps.onChange = (val: string) => {
					setData([id, val]);
				};
				break;
			}
			case "button": {
				baseProps.onClick = () => {
					baseProps.endpoint(data);
				};
				break;
			}
			default: {
				// Fallback to generic input-like change
				baseProps.onChange = (e: any) => {
					const next = e?.target?.value ?? e?.detail ?? e;
					setData([id, next]);
				};
				baseProps.value = data[id];
			}
		}
	}

	const children = filterMap(hast.children, (child) =>
		child.type === "comment"
			? undefined
			: (hastToReact(child, [data, setData], disabled) as any),
	);

	return children.length > 1
		? (jsxs as any)(elm, { ...baseProps, children })
		: (jsx as any)(elm, { ...baseProps, children: children[0] ?? undefined });
}

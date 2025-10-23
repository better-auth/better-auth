"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronsUpDown } from "lucide-react";

import { cn } from "../lib/utils";

export function SelectRoot({
	children,
	...props
}: {
	children: React.ReactElement<
		(typeof SelectItem | typeof SelectGroup | typeof SelectSeparator)[]
	>;
	props: React.ComponentProps<typeof SelectPrimitive.Root>;
}) {
	return (
		<SelectPrimitive.Root {...props}>
			<SelectPrimitive.Trigger>
				<SelectPrimitive.Value />
				<SelectPrimitive.Icon>
					<ChevronDown />
				</SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Content>
					<SelectPrimitive.ScrollUpButton>
						<ChevronsUpDown />
					</SelectPrimitive.ScrollUpButton>
					<SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
					<SelectPrimitive.ScrollDownButton>
						<ChevronsUpDown />
					</SelectPrimitive.ScrollDownButton>
					<SelectPrimitive.Arrow />
				</SelectPrimitive.Content>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);
}

export function SelectItem({ value }: { value: string }) {
	return (
		<SelectPrimitive.Item value={value}>
			<SelectPrimitive.ItemText>{value}</SelectPrimitive.ItemText>
			<SelectPrimitive.ItemIndicator>
				<Check />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
	);
}

export function SelectGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactElement<typeof SelectItem>;
}) {
	return (
		<SelectPrimitive.Group>
			<SelectPrimitive.Label>{label}</SelectPrimitive.Label>
			{children}
		</SelectPrimitive.Group>
	);
}

export const SelectSeparator = SelectPrimitive.Separator;

import { cn } from "@/libs/cn";
import type {
	ContextMenuCheckboxItemProps,
	ContextMenuContentProps,
	ContextMenuGroupLabelProps,
	ContextMenuItemLabelProps,
	ContextMenuItemProps,
	ContextMenuRadioItemProps,
	ContextMenuSeparatorProps,
	ContextMenuSubContentProps,
	ContextMenuSubTriggerProps,
} from "@kobalte/core/context-menu";
import { ContextMenu as ContextMenuPrimitive } from "@kobalte/core/context-menu";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type {
	ComponentProps,
	ParentProps,
	ValidComponent,
	VoidProps,
} from "solid-js";
import { splitProps } from "solid-js";

export const ContextMenu = ContextMenuPrimitive;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

type contextMenuSubTriggerProps<T extends ValidComponent = "div"> = ParentProps<
	ContextMenuSubTriggerProps<T> & {
		class?: string;
		inset?: boolean;
	}
>;

export const ContextMenuSubTrigger = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuSubTriggerProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuSubTriggerProps, [
		"class",
		"children",
		"inset",
	]);

	return (
		<ContextMenuPrimitive.SubTrigger
			class={cn(
				"flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[expanded]:bg-accent data-[expanded]:text-accent-foreground",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		>
			{local.children}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="ml-auto h-4 w-4"
				viewBox="0 0 24 24"
			>
				<path
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
					d="m9 6l6 6l-6 6"
				/>
				<title>Arrow</title>
			</svg>
		</ContextMenuPrimitive.SubTrigger>
	);
};

type contextMenuSubContentProps<T extends ValidComponent = "div"> =
	ContextMenuSubContentProps<T> & {
		class?: string;
	};

export const ContextMenuSubContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuSubContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuSubContentProps, [
		"class",
	]);

	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.SubContent
				class={cn(
					"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			/>
		</ContextMenuPrimitive.Portal>
	);
};

type contextMenuContentProps<T extends ValidComponent = "div"> =
	ContextMenuContentProps<T> & {
		class?: string;
	};

export const ContextMenuContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuContentProps, ["class"]);

	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Content
				class={cn(
					"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			/>
		</ContextMenuPrimitive.Portal>
	);
};

type contextMenuItemProps<T extends ValidComponent = "div"> =
	ContextMenuItemProps<T> & {
		class?: string;
		inset?: boolean;
	};

export const ContextMenuItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuItemProps, [
		"class",
		"inset",
	]);

	return (
		<ContextMenuPrimitive.Item
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		/>
	);
};

type contextMenuCheckboxItemProps<T extends ValidComponent = "div"> =
	ParentProps<
		ContextMenuCheckboxItemProps<T> & {
			class?: string;
		}
	>;

export const ContextMenuCheckboxItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuCheckboxItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuCheckboxItemProps, [
		"class",
		"children",
	]);

	return (
		<ContextMenuPrimitive.CheckboxItem
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<ContextMenuPrimitive.ItemIndicator class="absolute left-2 inline-flex h-3.5 w-3.5 items-center justify-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					class="h-4 w-4"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="m5 12l5 5L20 7"
					/>
					<title>Checkbox</title>
				</svg>
			</ContextMenuPrimitive.ItemIndicator>
			{local.children}
		</ContextMenuPrimitive.CheckboxItem>
	);
};

type contextMenuRadioItemProps<T extends ValidComponent = "div"> = ParentProps<
	ContextMenuRadioItemProps<T> & {
		class?: string;
	}
>;

export const ContextMenuRadioItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuRadioItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuRadioItemProps, [
		"class",
		"children",
	]);

	return (
		<ContextMenuPrimitive.RadioItem
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<ContextMenuPrimitive.ItemIndicator class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					class="h-2 w-2"
				>
					<g
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
					>
						<path d="M0 0h24v24H0z" />
						<path
							fill="currentColor"
							d="M7 3.34a10 10 0 1 1-4.995 8.984L2 12l.005-.324A10 10 0 0 1 7 3.34"
						/>
					</g>
					<title>Radio</title>
				</svg>
			</ContextMenuPrimitive.ItemIndicator>
			{local.children}
		</ContextMenuPrimitive.RadioItem>
	);
};

type contextMenuItemLabelProps<T extends ValidComponent = "div"> =
	ContextMenuItemLabelProps<T> & {
		class?: string;
		inset?: boolean;
	};

export const ContextMenuItemLabel = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, contextMenuItemLabelProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuItemLabelProps, [
		"class",
		"inset",
	]);

	return (
		<ContextMenuPrimitive.ItemLabel
			class={cn(
				"px-2 py-1.5 text-sm font-semibold text-foreground",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		/>
	);
};

type contextMenuGroupLabelProps<T extends ValidComponent = "span"> =
	ContextMenuGroupLabelProps<T> & {
		class?: string;
		inset?: boolean;
	};

export const ContextMenuGroupLabel = <T extends ValidComponent = "span">(
	props: PolymorphicProps<T, contextMenuGroupLabelProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuGroupLabelProps, [
		"class",
		"inset",
	]);

	return (
		<ContextMenuPrimitive.GroupLabel
			as="div"
			class={cn(
				"px-2 py-1.5 text-sm font-semibold text-foreground",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		/>
	);
};

type contextMenuSeparatorProps<T extends ValidComponent = "hr"> = VoidProps<
	ContextMenuSeparatorProps<T> & {
		class?: string;
	}
>;

export const ContextMenuSeparator = <T extends ValidComponent = "hr">(
	props: PolymorphicProps<T, contextMenuSeparatorProps<T>>,
) => {
	const [local, rest] = splitProps(props as contextMenuSeparatorProps, [
		"class",
	]);

	return (
		<ContextMenuPrimitive.Separator
			class={cn("-mx-1 my-1 h-px bg-border", local.class)}
			{...rest}
		/>
	);
};

export const ContextMenuShortcut = (props: ComponentProps<"span">) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<span
			class={cn(
				"ml-auto text-xs tracking-widest text-muted-foreground",
				local.class,
			)}
			{...rest}
		/>
	);
};

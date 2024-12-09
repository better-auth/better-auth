import { cn } from "@/libs/cn";
import type {
	MenubarCheckboxItemProps,
	MenubarContentProps,
	MenubarItemLabelProps,
	MenubarItemProps,
	MenubarMenuProps,
	MenubarRadioItemProps,
	MenubarRootProps,
	MenubarSeparatorProps,
	MenubarSubContentProps,
	MenubarSubTriggerProps,
	MenubarTriggerProps,
} from "@kobalte/core/menubar";
import { Menubar as MenubarPrimitive } from "@kobalte/core/menubar";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ComponentProps, ParentProps, ValidComponent } from "solid-js";
import { mergeProps, splitProps } from "solid-js";

export const MenubarSub = MenubarPrimitive.Sub;
export const MenubarRadioGroup = MenubarPrimitive.RadioGroup;

type menubarProps<T extends ValidComponent = "div"> = MenubarRootProps<T> & {
	class?: string;
};

export const Menubar = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarProps, ["class"]);

	return (
		<MenubarPrimitive
			class={cn(
				"flex h-9 items-center space-x-1 rounded-md border bg-background p-1 shadow-sm",
				local.class,
			)}
			{...rest}
		/>
	);
};

export const MenubarMenu = (props: MenubarMenuProps) => {
	const merge = mergeProps<MenubarMenuProps[]>({ gutter: 8, shift: -4 }, props);

	return <MenubarPrimitive.Menu {...merge} />;
};

type menubarTriggerProps<T extends ValidComponent = "button"> =
	MenubarTriggerProps<T> & {
		class?: string;
	};

export const MenubarTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, menubarTriggerProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarTriggerProps, ["class"]);

	return (
		<MenubarPrimitive.Trigger
			class={cn(
				"flex cursor-default select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-accent focus:text-accent-foreground data-[expanded]:bg-accent data-[expanded]:text-accent-foreground",
				local.class,
			)}
			{...rest}
		/>
	);
};

type menubarSubTriggerProps<T extends ValidComponent = "button"> = ParentProps<
	MenubarSubTriggerProps<T> & {
		class?: string;
		inset?: boolean;
	}
>;

export const MenubarSubTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, menubarSubTriggerProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarSubTriggerProps, [
		"class",
		"children",
		"inset",
	]);

	return (
		<MenubarPrimitive.SubTrigger
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
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				class="ml-auto h-4 w-4"
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
		</MenubarPrimitive.SubTrigger>
	);
};

type menubarSubContentProps<T extends ValidComponent = "div"> = ParentProps<
	MenubarSubContentProps<T> & {
		class?: string;
	}
>;

export const MenubarSubContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarSubContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarSubContentProps, [
		"class",
		"children",
	]);

	return (
		<MenubarPrimitive.Portal>
			<MenubarPrimitive.SubContent
				class={cn(
					"z-50 min-w-[8rem] origin-[--kb-menu-content-transform-origin] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			>
				{local.children}
			</MenubarPrimitive.SubContent>
		</MenubarPrimitive.Portal>
	);
};

type menubarContentProps<T extends ValidComponent = "div"> = ParentProps<
	MenubarContentProps<T> & {
		class?: string;
	}
>;

export const MenubarContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarContentProps, [
		"class",
		"children",
	]);

	return (
		<MenubarPrimitive.Portal>
			<MenubarPrimitive.Content
				class={cn(
					"z-50 min-w-[12rem] origin-[--kb-menu-content-transform-origin] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[expanded]:animate-in data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			>
				{local.children}
			</MenubarPrimitive.Content>
		</MenubarPrimitive.Portal>
	);
};

type menubarItemProps<T extends ValidComponent = "div"> =
	MenubarItemProps<T> & {
		class?: string;
		inset?: boolean;
	};

export const MenubarItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarItemProps, [
		"class",
		"inset",
	]);

	return (
		<MenubarPrimitive.Item
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		/>
	);
};

type menubarItemLabelProps<T extends ValidComponent = "div"> =
	MenubarItemLabelProps<T> & {
		class?: string;
		inset?: boolean;
	};

export const MenubarItemLabel = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarItemLabelProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarItemLabelProps, [
		"class",
		"inset",
	]);

	return (
		<MenubarPrimitive.ItemLabel
			class={cn(
				"px-2 py-1.5 text-sm font-semibold",
				local.inset && "pl-8",
				local.class,
			)}
			{...rest}
		/>
	);
};

type menubarSeparatorProps<T extends ValidComponent = "hr"> =
	MenubarSeparatorProps<T> & {
		class?: string;
	};

export const MenubarSeparator = <T extends ValidComponent = "hr">(
	props: PolymorphicProps<T, menubarSeparatorProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarSeparatorProps, ["class"]);

	return (
		<MenubarPrimitive.Separator
			class={cn("-mx-1 my-1 h-px bg-muted", local.class)}
			{...rest}
		/>
	);
};

type menubarCheckboxItemProps<T extends ValidComponent = "div"> = ParentProps<
	MenubarCheckboxItemProps<T> & {
		class?: string;
	}
>;

export const MenubarCheckboxItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarCheckboxItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarCheckboxItemProps, [
		"class",
		"children",
	]);

	return (
		<MenubarPrimitive.CheckboxItem
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<MenubarPrimitive.ItemIndicator class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
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
			</MenubarPrimitive.ItemIndicator>
			{local.children}
		</MenubarPrimitive.CheckboxItem>
	);
};

type menubarRadioItemProps<T extends ValidComponent = "div"> = ParentProps<
	MenubarRadioItemProps<T> & {
		class?: string;
	}
>;

export const MenubarRadioItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, menubarRadioItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as menubarRadioItemProps, [
		"class",
		"children",
	]);

	return (
		<MenubarPrimitive.RadioItem
			class={cn(
				"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<MenubarPrimitive.ItemIndicator class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
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
			</MenubarPrimitive.ItemIndicator>
			{local.children}
		</MenubarPrimitive.RadioItem>
	);
};

export const MenubarShortcut = (props: ComponentProps<"span">) => {
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

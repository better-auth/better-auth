import { cn } from "@/libs/cn";
import type {
	NavigationMenuContentProps,
	NavigationMenuRootProps,
	NavigationMenuTriggerProps,
} from "@kobalte/core/navigation-menu";
import { NavigationMenu as NavigationMenuPrimitive } from "@kobalte/core/navigation-menu";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import {
	type ParentProps,
	Show,
	type ValidComponent,
	mergeProps,
	splitProps,
} from "solid-js";

export const NavigationMenuItem = NavigationMenuPrimitive.Menu;
export const NavigationMenuLink = NavigationMenuPrimitive.Item;
export const NavigationMenuItemLabel = NavigationMenuPrimitive.ItemLabel;
export const NavigationMenuDescription =
	NavigationMenuPrimitive.ItemDescription;
export const NavigationMenuItemIndicator =
	NavigationMenuPrimitive.ItemIndicator;
export const NavigationMenuSub = NavigationMenuPrimitive.Sub;
export const NavigationMenuSubTrigger = NavigationMenuPrimitive.SubTrigger;
export const NavigationMenuSubContent = NavigationMenuPrimitive.SubContent;
export const NavigationMenuRadioGroup = NavigationMenuPrimitive.RadioGroup;
export const NavigationMenuRadioItem = NavigationMenuPrimitive.RadioItem;
export const NavigationMenuCheckboxItem = NavigationMenuPrimitive.CheckboxItem;
export const NavigationMenuSeparator = NavigationMenuPrimitive.Separator;

type withArrow = {
	withArrow?: boolean;
};

type navigationMenuProps<T extends ValidComponent = "ul"> = ParentProps<
	NavigationMenuRootProps<T> &
		withArrow & {
			class?: string;
		}
>;

export const NavigationMenu = <T extends ValidComponent = "ul">(
	props: PolymorphicProps<T, navigationMenuProps<T>>,
) => {
	const merge = mergeProps<navigationMenuProps<T>[]>(
		{
			get gutter() {
				return props.withArrow ? props.gutter : 6;
			},
			withArrow: false,
		},
		props,
	);
	const [local, rest] = splitProps(merge as navigationMenuProps, [
		"class",
		"children",
		"withArrow",
	]);

	return (
		<NavigationMenuPrimitive
			class={cn("flex w-max items-center justify-center gap-x-1", local.class)}
			{...rest}
		>
			{local.children}
			<NavigationMenuPrimitive.Viewport
				class={cn(
					"pointer-events-none z-50 overflow-x-clip overflow-y-visible rounded-md border bg-popover text-popover-foreground shadow",
					"h-[--kb-navigation-menu-viewport-height] w-[--kb-navigation-menu-viewport-width] transition-[width,height] duration-300",
					"origin-[--kb-menu-content-transform-origin]",
					"data-[expanded]:duration-300 data-[expanded]:animate-in data-[expanded]:fade-in data-[expanded]:zoom-in-95",
					"data-[closed]:duration-300 data-[closed]:animate-out data-[closed]:fade-out data-[closed]:zoom-out-95",
				)}
			>
				<Show when={local.withArrow}>
					<NavigationMenuPrimitive.Arrow class="transition-transform duration-300" />
				</Show>
			</NavigationMenuPrimitive.Viewport>
		</NavigationMenuPrimitive>
	);
};

type navigationMenuTriggerProps<T extends ValidComponent = "button"> =
	ParentProps<
		NavigationMenuTriggerProps<T> &
			withArrow & {
				class?: string;
			}
	>;

export const NavigationMenuTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, navigationMenuTriggerProps<T>>,
) => {
	const merge = mergeProps<navigationMenuTriggerProps<T>[]>(
		{
			get withArrow() {
				return props.as === undefined ? true : props.withArrow;
			},
		},
		props,
	);
	const [local, rest] = splitProps(merge as navigationMenuTriggerProps, [
		"class",
		"children",
		"withArrow",
	]);

	return (
		<NavigationMenuPrimitive.Trigger
			class={cn(
				"inline-flex w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium outline-none transition-colors duration-300 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
				local.class,
			)}
			{...rest}
		>
			{local.children}
			<Show when={local.withArrow}>
				<NavigationMenuPrimitive.Icon
					class="ml-1 size-3 transition-transform duration-300 data-[expanded]:rotate-180"
					as="svg"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
				>
					<path
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						d="m6 9l6 6l6-6"
					/>
				</NavigationMenuPrimitive.Icon>
			</Show>
		</NavigationMenuPrimitive.Trigger>
	);
};

type navigationMenuContentProps<T extends ValidComponent = "ul"> = ParentProps<
	NavigationMenuContentProps<T> & {
		class?: string;
	}
>;

export const NavigationMenuContent = <T extends ValidComponent = "ul">(
	props: PolymorphicProps<T, navigationMenuContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as navigationMenuContentProps, [
		"class",
		"children",
	]);

	return (
		<NavigationMenuPrimitive.Portal>
			<NavigationMenuPrimitive.Content
				class={cn(
					"absolute left-0 top-0 p-4 outline-none",
					"data-[motion^=from-]:duration-300 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52",
					"data-[motion^=to-]:duration-300 data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52",
					local.class,
				)}
				{...rest}
			>
				{local.children}
			</NavigationMenuPrimitive.Content>
		</NavigationMenuPrimitive.Portal>
	);
};

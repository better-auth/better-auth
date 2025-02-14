import { cn } from "@/libs/cn";
import type {
	ComboboxContentProps,
	ComboboxInputProps,
	ComboboxItemProps,
	ComboboxTriggerProps,
} from "@kobalte/core/combobox";
import { Combobox as ComboboxPrimitive } from "@kobalte/core/combobox";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ParentProps, ValidComponent, VoidProps } from "solid-js";
import { splitProps } from "solid-js";

export const Combobox = ComboboxPrimitive;
export const ComboboxDescription = ComboboxPrimitive.Description;
export const ComboboxErrorMessage = ComboboxPrimitive.ErrorMessage;
export const ComboboxItemDescription = ComboboxPrimitive.ItemDescription;
export const ComboboxHiddenSelect = ComboboxPrimitive.HiddenSelect;

type comboboxInputProps<T extends ValidComponent = "input"> = VoidProps<
	ComboboxInputProps<T> & {
		class?: string;
	}
>;

export const ComboboxInput = <T extends ValidComponent = "input">(
	props: PolymorphicProps<T, comboboxInputProps<T>>,
) => {
	const [local, rest] = splitProps(props as comboboxInputProps, ["class"]);

	return (
		<ComboboxPrimitive.Input
			class={cn(
				"h-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
				local.class,
			)}
			{...rest}
		/>
	);
};

type comboboxTriggerProps<T extends ValidComponent = "button"> = ParentProps<
	ComboboxTriggerProps<T> & {
		class?: string;
	}
>;

export const ComboboxTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, comboboxTriggerProps<T>>,
) => {
	const [local, rest] = splitProps(props as comboboxTriggerProps, [
		"class",
		"children",
	]);

	return (
		<ComboboxPrimitive.Control>
			<ComboboxPrimitive.Trigger
				class={cn(
					"flex h-9 w-full items-center justify-between rounded-md border border-input px-3 shadow-sm",
					local.class,
				)}
				{...rest}
			>
				{local.children}
				<ComboboxPrimitive.Icon class="flex h-3.5 w-3.5 items-center justify-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						class="h-4 w-4 opacity-50"
					>
						<path
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="m8 9l4-4l4 4m0 6l-4 4l-4-4"
						/>
						<title>Arrow</title>
					</svg>
				</ComboboxPrimitive.Icon>
			</ComboboxPrimitive.Trigger>
		</ComboboxPrimitive.Control>
	);
};

type comboboxContentProps<T extends ValidComponent = "div"> =
	ComboboxContentProps<T> & {
		class?: string;
	};

export const ComboboxContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, comboboxContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as comboboxContentProps, ["class"]);

	return (
		<ComboboxPrimitive.Portal>
			<ComboboxPrimitive.Content
				class={cn(
					"relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 origin-[--kb-combobox-content-transform-origin]",
					local.class,
				)}
				{...rest}
			>
				<ComboboxPrimitive.Listbox class="p-1" />
			</ComboboxPrimitive.Content>
		</ComboboxPrimitive.Portal>
	);
};

type comboboxItemProps<T extends ValidComponent = "li"> = ParentProps<
	ComboboxItemProps<T> & {
		class?: string;
	}
>;

export const ComboboxItem = <T extends ValidComponent = "li">(
	props: PolymorphicProps<T, comboboxItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as comboboxItemProps, [
		"class",
		"children",
	]);

	return (
		<ComboboxPrimitive.Item
			class={cn(
				"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		>
			<ComboboxPrimitive.ItemIndicator class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
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
					<title>Checked</title>
				</svg>
			</ComboboxPrimitive.ItemIndicator>
			<ComboboxPrimitive.ItemLabel>
				{local.children}
			</ComboboxPrimitive.ItemLabel>
		</ComboboxPrimitive.Item>
	);
};

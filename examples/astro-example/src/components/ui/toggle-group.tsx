import { cn } from "@/libs/cn";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type {
	ToggleGroupItemProps,
	ToggleGroupRootProps,
} from "@kobalte/core/toggle-group";
import { ToggleGroup as ToggleGroupPrimitive } from "@kobalte/core/toggle-group";
import type { VariantProps } from "class-variance-authority";
import type { Accessor, ParentProps, ValidComponent } from "solid-js";
import { createContext, createMemo, splitProps, useContext } from "solid-js";
import { toggleVariants } from "./toggle";

const ToggleGroupContext =
	createContext<Accessor<VariantProps<typeof toggleVariants>>>();

const useToggleGroup = () => {
	const context = useContext(ToggleGroupContext);

	if (!context) {
		throw new Error(
			"`useToggleGroup`: must be used within a `ToggleGroup` component",
		);
	}

	return context;
};

type toggleGroupProps<T extends ValidComponent = "div"> = ParentProps<
	ToggleGroupRootProps<T> &
		VariantProps<typeof toggleVariants> & {
			class?: string;
		}
>;

export const ToggleGroup = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, toggleGroupProps<T>>,
) => {
	const [local, rest] = splitProps(props as toggleGroupProps, [
		"class",
		"children",
		"size",
		"variant",
	]);

	const value = createMemo<VariantProps<typeof toggleVariants>>(() => ({
		size: local.size,
		variant: local.variant,
	}));

	return (
		<ToggleGroupPrimitive
			class={cn("flex items-center justify-center gap-1", local.class)}
			{...rest}
		>
			<ToggleGroupContext.Provider value={value}>
				{local.children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	);
};

type toggleGroupItemProps<T extends ValidComponent = "button"> =
	ToggleGroupItemProps<T> & {
		class?: string;
	};

export const ToggleGroupItem = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, toggleGroupItemProps<T>>,
) => {
	const [local, rest] = splitProps(props as toggleGroupItemProps, ["class"]);
	const context = useToggleGroup();

	return (
		<ToggleGroupPrimitive.Item
			class={cn(
				toggleVariants({
					variant: context().variant,
					size: context().size,
				}),
				local.class,
			)}
			{...rest}
		/>
	);
};

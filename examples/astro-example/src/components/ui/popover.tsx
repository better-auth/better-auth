import { cn } from "@/libs/cn";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type {
	PopoverContentProps,
	PopoverRootProps,
} from "@kobalte/core/popover";
import { Popover as PopoverPrimitive } from "@kobalte/core/popover";
import type { ParentProps, ValidComponent } from "solid-js";
import { mergeProps, splitProps } from "solid-js";

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverTitle = PopoverPrimitive.Title;
export const PopoverDescription = PopoverPrimitive.Description;

export const Popover = (props: PopoverRootProps) => {
	const merge = mergeProps<PopoverRootProps[]>({ gutter: 4 }, props);

	return <PopoverPrimitive {...merge} />;
};

type popoverContentProps<T extends ValidComponent = "div"> = ParentProps<
	PopoverContentProps<T> & {
		class?: string;
	}
>;

export const PopoverContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, popoverContentProps<T>>,
) => {
	const [local, rest] = splitProps(props as popoverContentProps, [
		"class",
		"children",
	]);

	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				class={cn(
					"z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
					local.class,
				)}
				{...rest}
			>
				{local.children}
				<PopoverPrimitive.CloseButton class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-[opacity,box-shadow] hover:opacity-100 focus:outline-none focus:ring-[1.5px] focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
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
							d="M18 6L6 18M6 6l12 12"
						/>
						<title>Close</title>
					</svg>
				</PopoverPrimitive.CloseButton>
			</PopoverPrimitive.Content>
		</PopoverPrimitive.Portal>
	);
};

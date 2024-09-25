import { type VariantProps, tv } from "tailwind-variants";
import Root from "./toggle.svelte";

export const toggleVariants = tv({
	base: "hover:bg-muted hover:text-muted-foreground focus-visible:ring-ring data-[state=on]:bg-accent data-[state=on]:text-accent-foreground inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50",
	variants: {
		variant: {
			default: "bg-transparent",
			outline:
				"border-input hover:bg-accent hover:text-accent-foreground border bg-transparent shadow-sm",
		},
		size: {
			default: "h-9 px-3",
			sm: "h-8 px-2",
			lg: "h-10 px-3",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "default",
	},
});

export type Variant = VariantProps<typeof toggleVariants>["variant"];
export type Size = VariantProps<typeof toggleVariants>["size"];

export {
	Root,
	//
	Root as Toggle,
};

import { cn } from "@/libs/cn";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ProgressRootProps } from "@kobalte/core/progress";
import { Progress as ProgressPrimitive } from "@kobalte/core/progress";
import type { ParentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

export const ProgressLabel = ProgressPrimitive.Label;
export const ProgressValueLabel = ProgressPrimitive.ValueLabel;

type progressProps<T extends ValidComponent = "div"> = ParentProps<
	ProgressRootProps<T> & {
		class?: string;
	}
>;

export const Progress = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, progressProps<T>>,
) => {
	const [local, rest] = splitProps(props as progressProps, [
		"class",
		"children",
	]);

	return (
		<ProgressPrimitive
			class={cn("flex w-full flex-col gap-2", local.class)}
			{...rest}
		>
			{local.children}
			<ProgressPrimitive.Track class="h-2 overflow-hidden rounded-full bg-primary/20">
				<ProgressPrimitive.Fill class="h-full w-[--kb-progress-fill-width] bg-primary transition-all duration-500 ease-linear data-[progress=complete]:bg-primary" />
			</ProgressPrimitive.Track>
		</ProgressPrimitive>
	);
};

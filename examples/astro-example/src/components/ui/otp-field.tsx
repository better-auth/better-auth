import { cn } from "@/libs/cn";
import type { DynamicProps, RootProps } from "@corvu/otp-field";
import OTPFieldPrimitive from "@corvu/otp-field";
import type { ComponentProps, ValidComponent } from "solid-js";
import { Show, splitProps } from "solid-js";

export const OTPFieldInput = OTPFieldPrimitive.Input;

type OTPFieldProps<T extends ValidComponent = "div"> = RootProps<T> & {
	class?: string;
};

export const OTPField = <T extends ValidComponent = "div">(
	props: DynamicProps<T, OTPFieldProps<T>>,
) => {
	const [local, rest] = splitProps(props, ["class"]);

	return (
		<OTPFieldPrimitive
			class={cn(
				"flex items-center gap-2 has-[:disabled]:opacity-50",
				local.class,
			)}
			{...rest}
		/>
	);
};

export const OTPFieldGroup = (props: ComponentProps<"div">) => {
	const [local, rest] = splitProps(props, ["class"]);

	return <div class={cn("flex items-center", local.class)} {...rest} />;
};

export const OTPFieldSeparator = (props: ComponentProps<"div">) => {
	return (
		// biome-ignore lint/a11y/useAriaPropsForRole: []
		<div role="separator" {...props}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="size-4"
				viewBox="0 0 15 15"
			>
				<title>Separator</title>
				<path
					fill="currentColor"
					fill-rule="evenodd"
					d="M5 7.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
	);
};

export const OTPFieldSlot = (
	props: ComponentProps<"div"> & { index: number },
) => {
	const [local, rest] = splitProps(props, ["class", "index"]);
	const context = OTPFieldPrimitive.useContext();
	const char = () => context.value()[local.index];
	const hasFakeCaret = () =>
		context.value().length === local.index && context.isInserting();
	const isActive = () => context.activeSlots().includes(local.index);

	return (
		<div
			class={cn(
				"relative flex size-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-shadow first:rounded-l-md first:border-l last:rounded-r-md",
				isActive() && "z-10 ring-[1.5px] ring-ring",
				local.class,
			)}
			{...rest}
		>
			{char()}
			<Show when={hasFakeCaret()}>
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div class="h-4 w-px animate-caret-blink bg-foreground" />
				</div>
			</Show>
		</div>
	);
};

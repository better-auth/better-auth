import { cn } from "@/libs/cn";
import type {
	PaginationEllipsisProps,
	PaginationItemProps,
	PaginationPreviousProps,
	PaginationRootProps,
} from "@kobalte/core/pagination";
import { Pagination as PaginationPrimitive } from "@kobalte/core/pagination";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import type { ValidComponent, VoidProps } from "solid-js";
import { mergeProps, splitProps } from "solid-js";
import { buttonVariants } from "./button";

export const PaginationItems = PaginationPrimitive.Items;

type paginationProps<T extends ValidComponent = "nav"> =
	PaginationRootProps<T> & {
		class?: string;
	};

export const Pagination = <T extends ValidComponent = "nav">(
	props: PolymorphicProps<T, paginationProps<T>>,
) => {
	const [local, rest] = splitProps(props as paginationProps, ["class"]);

	return (
		<PaginationPrimitive
			class={cn(
				"mx-auto flex w-full justify-center [&>ul]:flex [&>ul]:flex-row [&>ul]:items-center [&>ul]:gap-1",
				local.class,
			)}
			{...rest}
		/>
	);
};

type paginationItemProps<T extends ValidComponent = "button"> =
	PaginationItemProps<T> &
		Pick<VariantProps<typeof buttonVariants>, "size"> & {
			class?: string;
		};

export const PaginationItem = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, paginationItemProps<T>>,
) => {
	// @ts-expect-error - required `page`
	const merge = mergeProps<paginationItemProps[]>({ size: "icon" }, props);
	const [local, rest] = splitProps(merge as paginationItemProps, [
		"class",
		"size",
	]);

	return (
		<PaginationPrimitive.Item
			class={cn(
				buttonVariants({
					variant: "ghost",
					size: local.size,
				}),
				"aria-[current=page]:border aria-[current=page]:border-input aria-[current=page]:bg-background aria-[current=page]:shadow-sm aria-[current=page]:hover:bg-accent aria-[current=page]:hover:text-accent-foreground",
				local.class,
			)}
			{...rest}
		/>
	);
};

type paginationEllipsisProps<T extends ValidComponent = "div"> = VoidProps<
	PaginationEllipsisProps<T> & {
		class?: string;
	}
>;

export const PaginationEllipsis = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, paginationEllipsisProps<T>>,
) => {
	const [local, rest] = splitProps(props as paginationEllipsisProps, ["class"]);

	return (
		<PaginationPrimitive.Ellipsis
			class={cn("flex h-9 w-9 items-center justify-center", local.class)}
			{...rest}
		>
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
					d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0m7 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"
				/>
				<title>More pages</title>
			</svg>
		</PaginationPrimitive.Ellipsis>
	);
};

type paginationPreviousProps<T extends ValidComponent = "button"> =
	PaginationPreviousProps<T> &
		Pick<VariantProps<typeof buttonVariants>, "size"> & {
			class?: string;
		};

export const PaginationPrevious = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, paginationPreviousProps<T>>,
) => {
	const merge = mergeProps<paginationPreviousProps<T>[]>(
		{ size: "icon" },
		props,
	);
	const [local, rest] = splitProps(merge as paginationPreviousProps, [
		"class",
		"size",
	]);

	return (
		<PaginationPrimitive.Previous
			class={cn(
				buttonVariants({
					variant: "ghost",
					size: local.size,
				}),
				"aria-[current=page]:border aria-[current=page]:border-input aria-[current=page]:bg-background aria-[current=page]:shadow-sm aria-[current=page]:hover:bg-accent aria-[current=page]:hover:text-accent-foreground",
				local.class,
			)}
			{...rest}
		>
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
					d="m15 6l-6 6l6 6"
				/>
				<title>Previous page</title>
			</svg>
		</PaginationPrimitive.Previous>
	);
};

type paginationNextProps<T extends ValidComponent = "button"> =
	paginationPreviousProps<T>;

export const PaginationNext = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, paginationNextProps<T>>,
) => {
	const merge = mergeProps<paginationNextProps<T>[]>({ size: "icon" }, props);
	const [local, rest] = splitProps(merge as paginationNextProps, [
		"class",
		"size",
	]);

	return (
		<PaginationPrimitive.Next
			class={cn(
				buttonVariants({
					variant: "ghost",
					size: local.size,
				}),
				"aria-[current=page]:border aria-[current=page]:border-input aria-[current=page]:bg-background aria-[current=page]:shadow-sm aria-[current=page]:hover:bg-accent aria-[current=page]:hover:text-accent-foreground",
				local.class,
			)}
			{...rest}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
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
				<title>Next page</title>
			</svg>
		</PaginationPrimitive.Next>
	);
};

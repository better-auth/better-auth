"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const provider = React.createContext<{
	current: string | null;
	setCurrent: (value: string | null) => void;
}>({
	current: null,
	setCurrent: () => {},
});

function ApiMethodTabs({
	className,
	...props
}: React.ComponentProps<"div"> & { defaultValue: string | null }) {
	const [current, setCurrent] = React.useState<string | null>(
		props.defaultValue || null,
	);
	return (
		<provider.Provider value={{ current, setCurrent }}>
			<div
				data-slot="tabs"
				className={cn("flex flex-col gap-2", className)}
				{...props}
			/>
		</provider.Provider>
	);
}

const useApiMethodTabs = () => {
	return React.useContext(provider);
};

function ApiMethodTabsList({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="tabs-list"
			className={cn(
				"inline-flex justify-center items-center p-1 h-9 rounded-lg bg-muted text-muted-foreground w-fit",
				className,
			)}
			{...props}
		/>
	);
}

function ApiMethodTabsTrigger({
	className,
	...props
}: React.ComponentProps<"button"> & { value: string }) {
	const { setCurrent, current } = useApiMethodTabs();
	return (
		<button
			data-slot="tabs-trigger"
			className={cn(
				"data-[state=active]:bg-background data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			data-state={props.value === current ? "active" : "inactive"}
			onClick={() => {
				setCurrent(props.value);
			}}
			{...props}
		/>
	);
}

function ApiMethodTabsContent({
	className,
	...props
}: React.ComponentProps<"div"> & { value: string }) {
	const { current } = useApiMethodTabs();
	return (
		<div
			data-slot="tabs-content"
			className={cn(
				"flex-1 outline-none",
				className,
				props.value === current && "block",
				props.value !== current && "hidden",
			)}
			{...props}
		/>
	);
}

export {
	ApiMethodTabs,
	ApiMethodTabsList,
	ApiMethodTabsTrigger,
	ApiMethodTabsContent,
};

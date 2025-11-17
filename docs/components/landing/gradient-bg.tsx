"use client";
import type React from "react";
import { cn } from "@/lib/utils";

export function GradientBG({
	children,
	className,
	...props
}: React.PropsWithChildren<
	{
		className?: string;
	} & React.HTMLAttributes<HTMLElement>
>) {
	return (
		<div
			className={cn(
				"relative flex   content-center  transition duration-500  items-center flex-col flex-nowrap gap-10 h-min justify-center overflow-visible p-px decoration-clone w-full",
			)}
			{...props}
		>
			<div className={cn("w-auto z-10  px-4 py-2 rounded-none", className)}>
				{children}
			</div>
			<div
				className={cn(
					"flex-none inset-0 overflow-hidden absolute z-0 rounded-none bg-gradient-to-tl dark:from-amber-100/30 dark:via-zinc-900 dark:to-black blur-md opacity-50",
				)}
			/>
			<div className="bg-zinc-100 dark:bg-zinc-950 absolute z-1 flex-none inset-[2px] " />
		</div>
	);
}

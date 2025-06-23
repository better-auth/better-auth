"use client";

import { contents } from "@/components/sidebar-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, Github } from "lucide-react";
import { useTheme } from "next-themes";

export const Title = ({
	page,
}: {
	page: {
		data: {
			title: string;
			description: string | undefined;
			lastModified: Date | undefined;
		};
		url: string;
	};
}) => {
	const { theme } = useTheme();
	const category = contents.find((x) =>
		x.list.find((x) => x.href === page.url),
	);
	const icon = <>{category?.list.find((x) => x.href === page.url)?.icon({})}</>;
	return (
		<>
			<img
				src={`/banners/dark.png`}
				className={cn(
					"w-full h-auto rounded-lg",
					theme === "dark" ? "block" : "hidden",
				)}
				draggable={false}
				alt="light page banner"
			/>
			<img
				src={`/banners/light.png`}
				className={cn(
					"w-full h-auto rounded-lg",
					theme === "dark" ? "hidden" : "block",
				)}
				draggable={false}
				alt="dark page banner"
			/>
			<div className="absolute inset-0 flex flex-col w-full h-full gap-2 px-6 py-8 ">
				<div className="flex items-center gap-2">
					<div className="[&>*]:!size-7 [&>*]:text-xl [&>*]:flex [&>*]:justify-center [&>*]:items-center flex justify-center items-center text-center">
						{icon}
					</div>
					<h1 className="text-xl md:text-3xl">{page.data.title}</h1>
				</div>
				<h2 className="mt-1 text-base md:text-xl text-muted-foreground">
					{page.data.description}
				</h2>
				<div className="absolute bottom-0 left-0 hidden w-full gap-3 px-5 pb-5 md:flex">
					<Button
						variant={"outline"}
						size={"sm"}
						className="font-normal transition-all duration-100 ease-in-out cursor-pointer opacity-60 hover:opacity-100"
					>
						<Copy />
						Copy Markdown
					</Button>
					<Button
						variant={"outline"}
						size={"sm"}
						className="font-normal transition-all duration-100 ease-in-out cursor-pointer opacity-60 hover:opacity-100"
					>
						<Github />
						Edit on Github
					</Button>
				</div>
			</div>
		</>
	);
};

const Markdown = () => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="32"
			height="32"
			viewBox="0 0 24 24"
		>
			<path
				fill="currentColor"
				d="m16 15l3-3l-1.05-1.075l-1.2 1.2V9h-1.5v3.125l-1.2-1.2L13 12zM4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h16q.825 0 1.413.588T22 6v12q0 .825-.587 1.413T20 20zm1.5-5H7v-4.5h1v3h1.5v-3h1V15H12v-5q0-.425-.288-.712T11 9H6.5q-.425 0-.712.288T5.5 10z"
			/>
		</svg>
	);
};

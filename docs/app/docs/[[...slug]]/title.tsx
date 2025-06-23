"use client";
import { contents } from "@/components/sidebar-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy, Github, Loader2, X } from "lucide-react";
import { useState } from "react";

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
	const category = contents.find((x) =>
		x.list.find((x) => x.href === page.url),
	);
	const icon = <>{category?.list.find((x) => x.href === page.url)?.icon({})}</>;
	const [copyStatus, setCopyStatus] = useState<
		"idle" | "copying" | "success" | "error"
	>("idle");
	return (
		<>
			<img
				src={`/banners/light.png`}
				className={cn("w-full h-auto dark:hidden block")}
				draggable={false}
				alt="dark page banner"
			/>
			<img
				src={`/banners/dark.png`}
				className={cn("w-full h-auto hidden dark:block")}
				draggable={false}
				alt="light page banner"
			/>

			<div className="absolute inset-0 flex flex-col w-full h-full gap-2 px-6 py-8">
				<div className="flex items-center gap-2">
					<div className="[&>*]:!size-7 [&>*]:text-xl [&>*]:flex [&>*]:justify-center [&>*]:items-center flex justify-center items-center text-center">
						{icon}
					</div>
					<h1 className="text-xl md:text-3xl">{page.data.title}</h1>
				</div>
				<h2 className="mt-0.5 text-base font-medium md:text-xl text-muted-foreground">
					{page.data.description}
				</h2>
				<div className="absolute bottom-0 left-0 items-center hidden w-full gap-3 px-5 pb-5 md:flex">
					<Button
						variant={"outline"}
						size={"sm"}
						className={cn(
							"font-normal transition-all duration-100 ease-in-out cursor-pointer select-none",
							copyStatus === "idle" && "opacity-60 hover:opacity-100",
							copyStatus === "copying" && "opacity-100",
							copyStatus === "success" && "opacity-100",
							copyStatus === "error" && "opacity-100",
						)}
						onClick={async () => {
							setCopyStatus("copying");
							const result = await fetch(
								`https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/${page.url}.mdx`,
							);
							const markdown = await result.text();
							navigator.clipboard.writeText(markdown);
							await new Promise((resolve) => setTimeout(resolve, 200));
							setCopyStatus("success");
							setTimeout(() => {
								setCopyStatus("idle");
							}, 2000);
						}}
						disabled={copyStatus === "copying"}
					>
						{copyStatus === "idle" && <Copy />}
						{copyStatus === "copying" && <Loader2 className="animate-spin" />}
						{copyStatus === "success" && <Check />}
						{copyStatus === "error" && <X />}
						Copy Markdown
					</Button>
					<a
						href={`https://github.com/better-auth/better-auth/edit/main/docs/content/${page.url}.mdx`}
						target="_blank"
						className="h-8"
					>
						<Button
							variant={"outline"}
							size={"sm"}
							className="flex font-normal transition-all duration-100 ease-in-out cursor-pointer select-none opacity-60 hover:opacity-100"
						>
							<Github />
							Edit on Github
						</Button>
					</a>
				</div>
			</div>
		</>
	);
};

import { contents } from "@/components/sidebar-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, Github } from "lucide-react";

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
	return (
		<>
			<img
				src={`/banners/light.png`}
				className={cn("w-full h-auto rounded-lg dark:hidden block")}
				draggable={false}
				alt="dark page banner"
			/>
			<img
				src={`/banners/dark.png`}
				className={cn("w-full h-auto rounded-lg hidden dark:block")}
				draggable={false}
				alt="light page banner"
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
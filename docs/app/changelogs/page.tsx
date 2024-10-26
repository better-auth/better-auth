import Link from "next/link";
import { useId } from "react";

import { changelog } from "@/app/source";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { IconLink } from "./_components/changelog-layout";
import { BookIcon, GitHubIcon, XIcon } from "./_components/icons";
import { DiscordLogoIcon } from "@radix-ui/react-icons";
import { StarField } from "./_components/stat-field";

const ChangelogPage = () => {
	// @ts-ignore
	const page = changelog.getPage();

	if (page == null) {
		notFound();
	}

	const MDX = page.data.body;

	return (
		<div className="grid md:grid-cols-2 items-start">
			<div className="bg-gradient-to-tr overflow-hidden px-12 py-24 md:py-0 -mt-[100px] md:h-dvh relative md:sticky top-0 from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
				<StarField className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
				<Glow />

				<div className="flex flex-col justify-center max-w-xl mx-auto h-full">
					<h1 className="mt-14 font-sans font-semibold tracking-tighter text-5xl">
						All of the changes made will be{" "}
						<span className="">available here.</span>
					</h1>
					<p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
						Better Auth is comprehensive authentication library for TypeScript
						that provides a wide range of features to make authentication easier
						and more secure.
					</p>
					<hr className="h-px bg-gray-300 mt-5" />
					<div className="mt-8 flex flex-wrap text-gray-600 dark:text-gray-300  justify-center gap-x-1 gap-y-3 sm:gap-x-2 lg:justify-start">
						<IconLink
							href="/docs"
							icon={BookIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							Documentation
						</IconLink>
						<IconLink
							href="https://github.com/better-auth/better-auth"
							icon={GitHubIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							GitHub
						</IconLink>
						<IconLink
							href="https://discord.gg/GYC3W7tZzb"
							icon={DiscordLogoIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							Community
						</IconLink>
					</div>
					<p className="flex items-baseline absolute bottom-4 max-md:left-1/2 max-md:-translate-x-1/2 gap-x-2 text-[0.8125rem]/6 text-gray-500">
						Brought to you by{" "}
						<IconLink href="#" icon={XIcon} compact>
							BETTER-AUTH.
						</IconLink>
					</p>
				</div>
			</div>
			<div className="px-4 relative md:px-8 pb-12 md:py-12">
				<div className="absolute top-0 left-0 mb-2 w-2 h-full -translate-x-full bg-gradient-to-b from-black/10 dark:from-white/20 from-50% to-50% to-transparent bg-[length:100%_3px] bg-repeat-y"></div>

				<div className="max-w-2xl">
					<MDX
						components={{
							h2: (props) => (
								<h2
									className="text-2xl relative mt-16 font-bold flex-col flex justify-center tracking-tighter"
									{...props}
								>
									<time className="text-gray-500 dark:text-white/80 text-sm block md:absolute md:left-[-140px] font-normal tracking-normal">
										{props.children?.toString().includes("date=") &&
											props.children?.toString().split("date=")[1]}
									</time>
									{props.children?.toString().split("date=")[0].trim()}
								</h2>
							),
							h3: (props) => (
								<h3 className="text-xl tracking-tighter" {...props} />
							),
							p: (props) => <p className="my-4" {...props} />,
							ul: (props) => (
								<ul
									className="list-disc ml-10 my-4 text-[0.855rem] text-gray-600 dark:text-gray-300"
									{...props}
								/>
							),
							li: (props) => <li className="my-px" {...props} />,
							a: ({ className, ...props }: any) => (
								<Link
									className={cn("font-medium underline", className)}
									{...props}
								/>
							),
							Badge: (props) => (
								<Badge variant="secondary" className="py-0" {...props} />
							),
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default ChangelogPage;

function Glow() {
	let id = useId();

	return (
		<div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-tr from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
			<svg
				className="absolute -bottom-48 left-[-40%] h-[80rem] w-[180%] lg:-right-40 lg:bottom-auto lg:left-auto lg:top-[-40%] lg:h-[180%] lg:w-[80rem]"
				aria-hidden="true"
			>
				<defs>
					<radialGradient id={`${id}-desktop`} cx="100%">
						<stop offset="0%" stopColor="rgba(41, 37, 36, 0.4)" />
						<stop offset="53.95%" stopColor="rgba(28, 25, 23, 0.09)" />
						<stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
					</radialGradient>
					<radialGradient id={`${id}-mobile`} cy="100%">
						<stop offset="0%" stopColor="rgba(41, 37, 36, 0.3)" />
						<stop offset="53.95%" stopColor="rgba(28, 25, 23, 0.09)" />
						<stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
					</radialGradient>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill={`url(#${id}-desktop)`}
					className="hidden lg:block"
				/>
				<rect
					width="100%"
					height="100%"
					fill={`url(#${id}-mobile)`}
					className="lg:hidden"
				/>
			</svg>
			<div className="absolute inset-x-0 bottom-0 right-0 h-px dark:bg-white/5 mix-blend-overlay lg:left-auto lg:top-0 lg:h-auto lg:w-px" />
		</div>
	);
}

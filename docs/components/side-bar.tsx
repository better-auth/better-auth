"use client";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { AsideLink } from "@/components/ui/aside-link";
import { FadeIn, FadeInStagger } from "@/components/ui/fade-in";
import { Suspense, useEffect, useState } from "react";
import { useSearchContext } from "fumadocs-ui/provider";
import { usePathname, useRouter } from "next/navigation";
import { contents, examples } from "./sidebar-content";
import { Search } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { loglib } from "@loglib/tracker";

export default function ArticleLayout() {
	const { setOpenSearch } = useSearchContext();
	const pathname = usePathname();

	function getDefaultValue() {
		const defaultValue = contents.findIndex((item) =>
			item.list.some((listItem) => listItem.href === pathname),
		);
		return defaultValue === -1 ? 0 : defaultValue;
	}

	const router = useRouter();
	const [group, setGroup] = useState("docs");

	useEffect(() => {
		const grp = pathname.includes("examples") ? "examples" : "docs";
		setGroup(grp);
	}, []);

	const cts = group === "docs" ? contents : examples;

	return (
		<aside className="border-r border-lines md:block hidden overflow-y-auto w-[--fd-sidebar-width] h-full sticky top-[58px] min-h-[92dvh]">
			<Select
				defaultValue="docs"
				value={group}
				onValueChange={(val) => {
					loglib.track("sidebar-group-change", { group: val });
					setGroup(val);
					if (val === "docs") {
						router.push("/docs");
					} else {
						router.push("/docs/examples");
					}
				}}
			>
				<SelectTrigger className="rounded-none h-16 border-none border-b border">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="docs" className="h-12">
						<div className="flex items-center gap-1">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.4em"
								height="1.4em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M4.727 2.733c.306-.308.734-.508 1.544-.618C7.105 2.002 8.209 2 9.793 2h4.414c1.584 0 2.688.002 3.522.115c.81.11 1.238.31 1.544.618c.305.308.504.74.613 1.557c.112.84.114 1.955.114 3.552V18H7.426c-1.084 0-1.462.006-1.753.068c-.513.11-.96.347-1.285.667c-.11.108-.164.161-.291.505A1.3 1.3 0 0 0 4 19.7V7.842c0-1.597.002-2.711.114-3.552c.109-.816.308-1.249.613-1.557"
									opacity=".5"
								></path>
								<path
									fill="currentColor"
									d="M20 18H7.426c-1.084 0-1.462.006-1.753.068c-.513.11-.96.347-1.285.667c-.11.108-.164.161-.291.505s-.107.489-.066.78l.022.15c.11.653.31.998.616 1.244c.307.246.737.407 1.55.494c.837.09 1.946.092 3.536.092h4.43c1.59 0 2.7-.001 3.536-.092c.813-.087 1.243-.248 1.55-.494c.2-.16.354-.362.467-.664H8a.75.75 0 0 1 0-1.5h11.975c.018-.363.023-.776.025-1.25M7.25 7A.75.75 0 0 1 8 6.25h8a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 7M8 9.75a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z"
								></path>
							</svg>
							Docs
						</div>
						<p className="text-xs text-muted-foreground">
							get started, concepts, and plugins
						</p>
					</SelectItem>
					<SelectItem value="examples">
						<div className="flex items-center gap-1">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.4em"
								height="1.4em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M12 2c4.714 0 7.071 0 8.535 1.464c1.08 1.08 1.364 2.647 1.439 5.286L22 9.5H2.026v-.75c.075-2.64.358-4.205 1.438-5.286C4.93 2 7.286 2 12 2"
									opacity=".5"
								></path>
								<path
									fill="currentColor"
									d="M13 6a1 1 0 1 1-2 0a1 1 0 0 1 2 0m-3 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0M7 6a1 1 0 1 1-2 0a1 1 0 0 1 2 0"
								></path>
								<path
									fill="currentColor"
									d="M2 12c0 4.714 0 7.071 1.464 8.535c1.01 1.01 2.446 1.324 4.786 1.421L9 22V9.5H2.026l-.023.75Q2 11.066 2 12"
									opacity=".7"
								></path>
								<path
									fill="currentColor"
									d="M22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22c-.819 0-2.316 0-3-.008V9.5h13l-.003.75Q22 11.066 22 12"
								></path>
							</svg>
							Examples
						</div>
						<p className="text-xs">examples and guides</p>
					</SelectItem>
				</SelectContent>
			</Select>
			<div
				className="flex items-center gap-2 p-2 px-4 border-b bg-gradient-to-br dark:from-stone-900 dark:to-stone-950/80"
				onClick={() => {
					setOpenSearch(true);
					loglib.track("sidebar-search-open");
				}}
			>
				<Search className="h-4 w-4" />
				<p className="text-sm bg-gradient-to-tr from-gray-500 to-stone-400 bg-clip-text text-transparent">
					Search documentation...
				</p>
			</div>

			<Accordion
				type="single"
				collapsible
				defaultValue={`item-${getDefaultValue()}`}
			>
				{cts.map((item, i) => (
					<AccordionItem value={`item-${i}`} key={item.title}>
						<AccordionTrigger className="border-b border-lines px-5 py-2.5 text-left">
							<div className="flex items-center gap-2">
								{item.Icon && <item.Icon className="w-5 h-5" />}
								{item.title}
							</div>
						</AccordionTrigger>
						<AccordionContent className=" space-y-1  p-0">
							<FadeInStagger faster>
								{item.list.map((listItem, j) => (
									<FadeIn
										key={listItem.title}
										onClick={() => {
											loglib.track("sidebar-link-click", {
												title: listItem.title,
												href: listItem.href,
											});
										}}
									>
										<Suspense fallback={<>Loading...</>}>
											{listItem.group ? (
												<div className="flex flex-row gap-2 items-center mx-5 my-1  ">
													<p className="text-sm bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text text-transparent from-gray-900 to-stone-900">
														{listItem.title}
													</p>
													<div className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
												</div>
											) : (
												<AsideLink
													href={listItem.href}
													startWith="/docs"
													title={listItem.title}
													className="break-words w-[--fd-sidebar-width]"
												>
													<listItem.icon className="w-4 h-4 text-stone-950 dark:text-white" />
													{listItem.title}
												</AsideLink>
											)}
										</Suspense>
									</FadeIn>
								))}
							</FadeInStagger>
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</aside>
	);
}

"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ChevronDownIcon, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AsideLink } from "@/components/ui/aside-link";
import { cn } from "@/lib/utils";
import type { ContentListItem } from "./sidebar-content";
import { contents, examples } from "./sidebar-content";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

export default function ArticleLayout() {
	const [currentOpen, setCurrentOpen] = useState<number>(0);

	const { setOpenSearch } = useSearchContext();
	const pathname = usePathname();

	function getDefaultValue() {
		const defaultValue = contents.findIndex((item) =>
			item.list.some(
				(listItem) =>
					listItem.href === pathname ||
					listItem.children?.some((child) => child.href === pathname),
			),
		);
		return defaultValue === -1 ? 0 : defaultValue;
	}

	const [group, setGroup] = useState("docs");

	useEffect(() => {
		const grp = pathname.includes("examples") ? "examples" : "docs";
		setGroup(grp);
		setCurrentOpen(getDefaultValue());
	}, [pathname]);

	const cts = group === "docs" ? contents : examples;

	return (
		<div className={cn("fixed start-0 top-0")}>
			<aside
				className={cn(
					"navbar:transition-all",
					"border-r border-lines top-[55px] navbar:flex hidden navbar:w-[268px] lg:w-[286px]! overflow-y-auto absolute h-[calc(100dvh-55px)] pb-2 flex-col justify-between w-[var(--fd-sidebar-width)]",
				)}
			>
				<div>
					<SidebarTab group={group} setGroup={setGroup} />
					<button
						className="flex w-full items-center gap-2 px-5 py-2.5 border-b text-muted-foreground dark:bg-zinc-950 dark:border-t-zinc-900/30 dark:border-t"
						onClick={() => {
							setOpenSearch(true);
						}}
					>
						<Search className="size-4 mx-0.5" />
						<p className="text-sm">Search documentation...</p>
					</button>

					<MotionConfig
						transition={{ duration: 0.4, type: "spring", bounce: 0 }}
					>
						<div className="flex flex-col">
							{cts.map((item, index) => (
								<div key={item.title}>
									<button
										className="border-b w-full hover:underline border-lines text-sm px-5 py-2.5 text-left flex items-center gap-2"
										onClick={() => {
											if (currentOpen === index) {
												setCurrentOpen(-1);
											} else {
												setCurrentOpen(index);
											}
										}}
									>
										<item.Icon className="size-5" />
										<span className="grow">{item.title}</span>
										{item.isNew && <NewBadge />}
										{item.isUpdated && <UpdatedBadge />}
										<motion.div
											animate={{ rotate: currentOpen === index ? 180 : 0 }}
										>
											<ChevronDownIcon
												className={cn(
													"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
												)}
											/>
										</motion.div>
									</button>
									<AnimatePresence initial={false}>
										{currentOpen === index && (
											<motion.div
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												exit={{ opacity: 0, height: 0 }}
												className="relative overflow-hidden"
											>
												<motion.div className="text-sm">
													{item.list.map((listItem, j) => (
														<SidebarListItem
															key={listItem.title}
															listItem={listItem}
															pathname={pathname}
														/>
													))}
												</motion.div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							))}
						</div>
					</MotionConfig>
				</div>
			</aside>
		</div>
	);
}

function NewBadge({ isSelected }: { isSelected?: boolean }) {
	return (
		<div className="flex items-center justify-end w-full">
			<Badge
				className={cn(
					" pointer-events-none !no-underline border-dashed !decoration-transparent",
					isSelected && "!border-solid",
				)}
				variant={isSelected ? "default" : "outline"}
			>
				New
			</Badge>
		</div>
	);
}

function UpdatedBadge({ isSelected }: { isSelected?: boolean }) {
	return (
		<div className="flex items-center justify-end w-full">
			<Badge
				className={cn(
					" pointer-events-none !no-underline border-dashed !decoration-transparent",
					isSelected && "!border-solid",
				)}
				variant={isSelected ? "default" : "outline"}
			>
				Updated
			</Badge>
		</div>
	);
}

function SidebarListItem({
	listItem,
	pathname,
}: {
	listItem: ContentListItem;
	pathname: string;
}) {
	const hasChildren = listItem.children && listItem.children.length > 0;
	const isActive = pathname === listItem.href;
	const hasActiveChild = listItem.children?.some(
		(child) => child.href === pathname,
	);

	if (listItem.group) {
		return (
			<div className="flex flex-row items-center gap-2 mx-5 my-1">
				<p className="text-sm text-transparent bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text from-gray-900 to-stone-900">
					{listItem.title}
				</p>
				<div className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
			</div>
		);
	}

	if (hasChildren) {
		const showChildren = isActive || hasActiveChild;
		return (
			<div>
				<AsideLink
					hasSubpages={listItem.children && listItem.children.length > 0}
					href={listItem.href}
					startWith="/docs"
					title={listItem.title}
					className="break-words text-nowrap w-[--fd-sidebar-width] [&>div>div]:hover:!bg-fd-muted"
					activeClassName="[&>div>div]:!bg-fd-muted"
				>
					<div className="min-w-4">
						<listItem.icon className="text-stone-950 dark:text-white" />
					</div>
					{listItem.title}
					{listItem.isNew && <NewBadge />}
					{listItem.isUpdated && <UpdatedBadge />}
				</AsideLink>
				<AnimatePresence initial={false}>
					{showChildren && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.2 }}
							className="overflow-hidden"
						>
							<div className="relative">
								{/* Vertical line overlay */}
								<div className="absolute left-7 top-0 bottom-0 w-px bg-border pointer-events-none z-10" />
								{listItem.children?.map((child) => {
									const icon = child.icon({
										className: "text-stone-950 dark:text-white",
									});
									return child.group ? (
										<div
											key={child.title}
											className="flex flex-row items-center gap-2 mx-5 pl-6 my-1"
										>
											<p className="text-sm text-transparent bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text from-gray-900 to-stone-900">
												{child.title}
											</p>
											<div className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
										</div>
									) : (
										<Suspense
											key={child.title}
											fallback={
												<div className="flex items-center gap-2 px-5 py-1.5 animate-pulse">
													<div
														className="size-4 shrink-0 bg-muted rounded-full"
														aria-hidden="true"
													/>
													<div
														className="h-3 bg-muted rounded-md"
														style={{
															width: `${Math.random() * (70 - 30) + 30}%`,
														}}
														aria-hidden="true"
													/>
													<span className="sr-only">Loading...</span>
												</div>
											}
										>
											<AsideLink
												href={child.href}
												startWith="/docs"
												title={child.title}
												className="break-words pl-11 text-nowrap w-full [&>div>div]:hover:!bg-fd-muted"
												activeClassName="[&>div>div]:!bg-fd-muted"
											>
												{icon && <div className="min-w-4">{icon}</div>}
												{child.title}
												{child.isNew && <NewBadge />}
												{child.isUpdated && <UpdatedBadge />}
											</AsideLink>
										</Suspense>
									);
								})}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	}

	return (
		<Suspense
			fallback={
				<div className="flex items-center gap-2 px-5 py-1.5 animate-pulse">
					<div
						className="size-4 shrink-0 bg-muted rounded-full"
						aria-hidden="true"
					/>
					<div
						className="h-3 bg-muted rounded-md"
						style={{
							width: `${Math.random() * (70 - 30) + 30}%`,
						}}
						aria-hidden="true"
					/>
					<span className="sr-only">Loading...</span>
				</div>
			}
		>
			<AsideLink
				href={listItem.href}
				startWith="/docs"
				title={listItem.title}
				className="break-words text-nowrap w-[--fd-sidebar-width] [&>div>div]:hover:!bg-fd-muted"
				activeClassName="[&>div>div]:!bg-fd-muted"
			>
				<div className="min-w-4">
					<listItem.icon className="text-stone-950 dark:text-white" />
				</div>
				{listItem.title}
				{listItem.isNew && <NewBadge />}
				{listItem.isUpdated && <UpdatedBadge />}
			</AsideLink>
		</Suspense>
	);
}

const tabs = [
	{
		value: "docs",
		icon: (
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
		),
		title: "Docs",
		description: "get started, concepts, and plugins",
	},
	{
		value: "docs-canary",
		icon: (
			<svg
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					opacity="0.5"
					d="M4.727 2.733C5.033 2.425 5.461 2.225 6.271 2.115C7.105 2.002 8.209 2 9.793 2H14.207C15.791 2 16.895 2.002 17.729 2.115C18.539 2.225 18.967 2.425 19.273 2.733C19.578 3.041 19.777 3.473 19.886 4.29C19.998 5.13 20 6.245 20 7.842V18H7.426C6.342 18 5.964 18.006 5.673 18.068C5.16 18.178 4.713 18.415 4.388 18.735C4.278 18.843 4.224 18.896 4.097 19.24C4.03698 19.3862 4.00411 19.542 4 19.7V7.842C4 6.245 4.002 5.131 4.114 4.29C4.223 3.474 4.422 3.041 4.727 2.733Z"
					fill="currentColor"
				/>
				<path
					d="M20 18H7.42598C6.34198 18 5.96398 18.006 5.67298 18.068C5.15998 18.178 4.71298 18.415 4.38798 18.735C4.27798 18.843 4.22398 18.896 4.09698 19.24C3.96998 19.584 3.98998 19.729 4.03098 20.02L4.05298 20.17C4.16298 20.823 4.36298 21.168 4.66898 21.414C4.97598 21.66 5.40598 21.821 6.21898 21.908C7.05598 21.998 8.16498 22 9.75498 22H14.185C15.775 22 16.885 21.999 17.721 21.908C18.534 21.821 18.964 21.66 19.271 21.414C19.471 21.254 19.625 21.052 19.738 20.75H7.99998C7.80107 20.75 7.6103 20.671 7.46965 20.5303C7.329 20.3897 7.24998 20.1989 7.24998 20C7.24998 19.8011 7.329 19.6103 7.46965 19.4697C7.6103 19.329 7.80107 19.25 7.99998 19.25H19.975C19.993 18.887 19.998 18.474 20 18Z"
					fill="currentColor"
				/>
				<path
					d="M12.5 6.5H11.7002V8.7002C11.7002 8.93489 11.6409 9.16612 11.5283 9.37207L10.4472 11.3496H13.7529L12.6719 9.37207C12.5593 9.16612 12.4999 8.93489 12.5 8.7002V6.5ZM9.04881 13.9082C9.01565 13.9689 8.99887 14.0373 8.99998 14.1064C9.00118 14.1758 9.02035 14.2441 9.05564 14.3037C9.09105 14.3634 9.14181 14.4129 9.20213 14.4473C9.26247 14.4816 9.33093 14.5 9.40037 14.5H14.8008C14.87 14.4999 14.9378 14.4815 14.998 14.4473C15.0584 14.4129 15.1091 14.3634 15.1445 14.3037C15.1798 14.244 15.199 14.1758 15.2002 14.1064C15.2013 14.0372 15.1845 13.9689 15.1513 13.9082L14.2998 12.3496H9.90037L9.04881 13.9082ZM13.5127 8.79883C13.5209 8.83123 13.5326 8.86301 13.5488 8.89258L16.0283 13.4277C16.1449 13.6409 16.2043 13.8811 16.2002 14.124C16.196 14.367 16.1288 14.6054 16.0049 14.8145C15.8809 15.0234 15.7043 15.1962 15.4931 15.3164C15.2819 15.4367 15.0428 15.5001 14.7998 15.5H9.40037C9.15731 15.5001 8.91822 15.4367 8.70701 15.3164C8.49593 15.1962 8.31921 15.0234 8.19529 14.8145C8.07133 14.6054 8.00418 14.367 7.99998 14.124C7.99581 13.8811 8.05521 13.6409 8.17185 13.4277L10.6513 8.89258C10.6675 8.86303 10.6792 8.83121 10.6875 8.79883L10.7002 8.7002V6.5H10.5254C10.2492 6.5 10.0254 6.27614 10.0254 6C10.0254 5.72386 10.2492 5.5 10.5254 5.5H13.6748C13.9509 5.5 14.1748 5.72386 14.1748 6C14.1748 6.27614 13.9509 6.5 13.6748 6.5H13.5V8.7002L13.5127 8.79883Z"
					fill="currentColor"
				/>
			</svg>
		),
		title: "Docs",
		badge: "Canary",
		description: "get started, concepts, and plugins",
	},
	{
		value: "examples",
		icon: (
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
		),
		title: "Examples",
		description: "examples and guides",
	},
];

function SidebarTab({
	group,
	setGroup,
}: {
	group: string;
	setGroup: (group: string) => void;
}) {
	const router = useRouter();
	const selected = tabs.find((tab) => tab.value === group);

	return (
		<Select
			value={group}
			onValueChange={(val) => {
				if (val === "docs-canary") {
					window.open(
						"https://canary.better-auth.com",
						"_blank",
						"noreferrer,noopener",
					);
					return;
				}

				setGroup(val);
				if (val === "docs") {
					router.push("/docs");
				} else {
					router.push("/docs/examples");
				}
			}}
		>
			<SelectTrigger className="h-16 border border-b border-none rounded-none px-5">
				{selected ? (
					<div className="flex flex-col gap-1 items-start">
						<div className="flex items-center gap-1 -ml-0.5">
							{selected.icon}
							{selected.title}
							{selected.badge ? (
								<Badge
									variant="outline"
									className="ms-1.5 text-[0.65rem] text-muted-foreground"
								>
									{selected.badge}
								</Badge>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">
							{selected.description}
						</p>
					</div>
				) : null}
			</SelectTrigger>
			<SelectContent>
				{tabs.map((tab) => (
					<SelectItem
						key={tab.value}
						value={tab.value}
						className="h-12 flex flex-col items-start gap-1"
					>
						<div className="flex items-center gap-1">
							{tab.icon}
							{tab.title}
							{tab.badge ? (
								<Badge
									variant="outline"
									className="ms-1.5 text-[0.65rem] text-muted-foreground"
								>
									{tab.badge}
								</Badge>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">{tab.description}</p>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

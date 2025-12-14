"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = {
	title: string;
	value: string;
	content?: string | React.ReactNode | any;
};

export const AuthTabs = ({ tabs: propTabs }: { tabs: Tab[] }) => {
	const [active, setActive] = useState<Tab>(propTabs[0]);
	const [tabs, setTabs] = useState<Tab[]>(propTabs);
	const isActive = (tab: Tab) => {
		return tab.value === tabs[0].value;
	};
	const moveSelectedTabToTop = (idx: number) => {
		const newTabs = [...propTabs];
		const selectedTab = newTabs.splice(idx, 1);
		newTabs.unshift(selectedTab[0]);
		setTabs(newTabs);
		setActive(newTabs[0]);
	};

	return (
		<>
			<div
				className={cn(
					"flex flex-row items-center justify-start mt-0 relative no-visible-scrollbar border-x w-full border-t max-w-max bg-opacity-0",
				)}
			>
				{propTabs.map((tab, idx) => (
					<button
						key={tab.title}
						onClick={() => {
							moveSelectedTabToTop(idx);
						}}
						className={cn(
							"relative px-4 py-2 rounded-full opacity-80 hover:opacity-100",
						)}
					>
						{active.value === tab.value && (
							<div
								className={cn(
									"absolute inset-0 bg-gray-200 dark:bg-zinc-900/90 opacity-100",
								)}
							/>
						)}

						<span
							className={cn(
								"relative block text-black dark:text-white",
								active.value === tab.value
									? "text-opacity-100 font-medium"
									: "opacity-40 ",
							)}
						>
							{tab.title}
						</span>
					</button>
				))}
			</div>
			<div className="relative w-full h-full">
				{tabs.map((tab, idx) => (
					<div
						key={tab.value}
						style={{
							scale: 1 - idx * 0.1,
							zIndex: -idx,
							opacity: idx < 3 ? 1 - idx * 0.1 : 0,
						}}
						className={cn("h-full", isActive(tab) ? "" : "hidden")}
					>
						{tab.content}
					</div>
				))}
			</div>
		</>
	);
};

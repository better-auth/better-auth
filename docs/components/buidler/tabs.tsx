"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = {
	title: string;
	value: string;
	content?: string | React.ReactNode | any;
};

export const AuthTabs = ({
	tabs: propTabs,
	containerClassName,
	activeTabClassName,
	tabClassName,
}: {
	tabs: Tab[];
	containerClassName?: string;
	activeTabClassName?: string;
	tabClassName?: string;
}) => {
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

	const [hovering, setHovering] = useState(false);

	return (
		<>
			<div
				className={cn(
					"flex flex-row items-center justify-start mt-0 [perspective:1000px] relative overflow-auto sm:overflow-visible no-visible-scrollbar border-x w-full border-t max-w-max bg-opacity-0",
					containerClassName,
				)}
			>
				{propTabs.map((tab, idx) => (
					<button
						key={tab.title}
						onClick={() => {
							moveSelectedTabToTop(idx);
						}}
						onMouseEnter={() => setHovering(true)}
						onMouseLeave={() => setHovering(false)}
						className={cn(
							"relative px-4 py-2 rounded-full opacity-80 hover:opacity-100",
							tabClassName,
						)}
						style={{
							transformStyle: "preserve-3d",
						}}
					>
						{active.value === tab.value && (
							<motion.div
								transition={{
									duration: 0.2,
									delay: 0.1,

									type: "keyframes",
								}}
								animate={{
									x: tabs.indexOf(tab) === 0 ? [0, 0, 0] : [0, 0, 0],
								}}
								className={cn(
									"absolute inset-0 bg-gray-200 dark:bg-zinc-900/90 opacity-100",
									activeTabClassName,
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
					<motion.div
						key={tab.value}
						style={{
							scale: 1 - idx * 0.1,
							zIndex: -idx,
							opacity: idx < 3 ? 1 - idx * 0.1 : 0,
						}}
						animate={{
							transition: {
								duration: 0.2,
								delay: 0.1,
								type: "keyframes",
							},
						}}
						className={cn("w-50 h-full", isActive(tab) ? "" : "hidden")}
					>
						{tab.content}
					</motion.div>
				))}
			</div>
		</>
	);
};

"use client";

import { Progress } from "./ui/progress";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const VersionProgress = ({ releases }: { releases: string[] }) => {
	const majorVersion = releases[0];
	const minorPatch = parseInt(releases.slice(1, 3).join(""));
	const currentPercent = (minorPatch / 100) * 100;
	return (
		<Link
			href="https://github.com/orgs/better-auth/projects/2"
			className="w-full"
		>
			<div className="inline-flex bg-background ring-black border border-input shadow-sm hover:border hover:border-input hover:text-accent-foreground rounded-none h-10 p-5 ml-auto z-50 overflow-hidden text-sm font-medium focus-visible:outline-none  disabled:pointer-events-none disabled:opacity-50 bg-transprent dark:text-white text-black px-4 py-2 max-w-full whitespace-pre md:flex group relative w-full justify-center items-center gap-2 transition-all duration-300 ease-out hover:ring-black">
				<div className="flex w-full gap-2 items-center">
					<p style={{ fontFamily: "monospace" }}>v{majorVersion}.0</p>
					<div className="flex gap-2 items-center">
						{Array.from({ length: 10 }).map((el, indx) => {
							return <Bars current={currentPercent} indx={indx} />;
						})}
					</div>
					{/* <Progress value={currentPercent} /> */}
					<p style={{ fontFamily: "monospace" }}>{currentPercent}%</p>
				</div>
			</div>
		</Link>
	);
};
export const Bars = ({ current, indx }: { current: number; indx: number }) => {
	const barCount = Math.floor(current / 10);
	const filled = barCount >= indx + 1;
	const gradientFill = filled
		? "bg-gradient-to-tr from-green-800 via-red-300 to-red-400"
		: "bg-white";
	return (
		<div className={cn(gradientFill, "rounded-md w-[3px] h-[15px]")}></div>
	);
};

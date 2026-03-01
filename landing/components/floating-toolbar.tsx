"use client";

import { motion } from "framer-motion";
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export function FloatingToolbar() {
	const { setOpen } = useCommandMenu();

	return (
		<motion.div
			initial={{ y: 20, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.4, delay: 0.8, ease: "easeOut" }}
			className="fixed bottom-5 right-5 z-[100] flex items-center border border-foreground/[0.06] bg-background/60 backdrop-blur-md"
		>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="group flex items-center justify-center size-9 text-foreground/40 hover:text-foreground/70 transition-colors"
			>
				<kbd className="flex items-center gap-0.5 text-[10px] font-mono">
					<span className="text-[11px]">&#8984;</span>K
				</kbd>
				<span className="sr-only">Command menu</span>
			</button>
			<span className="w-px h-3 bg-foreground/[0.08]" />
			<div className="flex items-center justify-center size-9 [&_button]:text-foreground/40 [&_button:hover]:text-foreground/70">
				<ThemeToggle />
			</div>
		</motion.div>
	);
}

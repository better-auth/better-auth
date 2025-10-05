"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
	const { setTheme, theme } = useTheme();

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={() => setTheme(theme === "light" ? "dark" : "light")}
		>
			<Sun className="h-6 w-[1.3rem] dark:hidden" color="#000" />
			<Moon className="hidden h-5 w-5 dark:block" />
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}

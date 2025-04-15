"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle(props: ComponentProps<typeof Button>) {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Toggle Theme"
					{...props}
					className={cn(
						"flex ring-0 shrink-0 md:w-[3.56rem] md:h-14 md:border-l md:text-muted-foreground max-md:-mr-1.5 max-md:hover:bg-transparent",
						props.className,
					)}
				>
					<Sun className="size-4 fill-current dark:hidden md:size-5" />
					<Moon className="absolute fill-current size-4 hidden dark:block md:size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="rounded-none" align="end">
				<DropdownMenuItem
					className="rounded-none"
					onClick={() => setTheme("light")}
				>
					Light
				</DropdownMenuItem>
				<DropdownMenuItem
					className="rounded-none"
					onClick={() => setTheme("dark")}
				>
					Dark
				</DropdownMenuItem>
				<DropdownMenuItem
					className="rounded-none"
					onClick={() => setTheme("system")}
				>
					System
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

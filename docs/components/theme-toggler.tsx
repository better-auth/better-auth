"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
						"flex ring-0 shrink-0 navbar:w-[3.56rem] navbar:h-14 navbar:border-l navbar:text-muted-foreground max-navbar:-mr-1.5 max-navbar:hover:bg-transparent",
						props.className,
					)}
				>
					<Sun
						className="size-4 fill-current dark:hidden navbar:size-5"
						aria-hidden="true"
					/>
					<Moon
						className="absolute fill-current size-4 hidden dark:block navbar:size-5"
						aria-hidden="true"
					/>
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

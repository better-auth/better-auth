"use client";

import { Moon, MoonIcon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="border-l ring-0 rounded-none h-14 w-14 hidden md:flex shrink-0"
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function MobileThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <div className="md:hidden">
      <Button
        className="dark:hidden"
        onClick={() => {
          setTheme("light");
        }}
        variant={"ghost"}
      >
        <Sun className="w-4 h-4" />
      </Button>
      <Button
        className="hidden dark:visible"
        onClick={() => {
          setTheme("dark");
        }}
        variant={"ghost"}
      >
        <MoonIcon className="w-4 h-4" />
      </Button>
    </div>
  );
}

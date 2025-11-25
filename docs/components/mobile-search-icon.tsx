"use client";

import { useSearchContext } from "fumadocs-ui/provider";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileSearchIconProps {
	className?: string;
}

export function MobileSearchIcon({ className }: MobileSearchIconProps) {
	const { setOpenSearch } = useSearchContext();

	const handleSearchClick = () => {
		setOpenSearch(true);
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label="Search"
			onClick={handleSearchClick}
			className={cn(
				"flex ring-0 shrink-0 navbar:hidden size-9 hover:bg-transparent",
				className,
			)}
		>
			<Search className="size-4" />
		</Button>
	);
}

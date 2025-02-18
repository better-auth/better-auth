import React from "react";
import { useSearchContext } from "fumadocs-ui/provider";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

function SearchDocumentation({
    onClick,
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    const { setOpenSearch } = useSearchContext();

    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        setOpenSearch(true);
        onClick?.(event);
    };

    return (
        <div
            {...props}
            className={cn(
                "flex items-center gap-2 p-2 px-4 border-b bg-gradient-to-br dark:from-stone-900 dark:to-stone-950/80",
                className
            )}
            onClick={handleClick}
        >
            <Search className="w-4 h-4" />
            <p className="text-sm text-transparent bg-gradient-to-tr from-gray-500 to-stone-400 bg-clip-text">
                Search documentation...
            </p>
        </div>
    );
}

export default SearchDocumentation;

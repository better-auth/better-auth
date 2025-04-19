import { cn } from "@/lib/utils";

interface ResourceFilterProps {
	title: string;
	tags: string[];
	activeTag: string | null;
	onTagClick: (tag: string | null) => void;
	className?: string;
}

export function ResourceFilter({
	title,
	tags,
	activeTag,
	onTagClick,
	className,
}: ResourceFilterProps) {
	return (
		<div className={cn("space-y-4", className)}>
			<div className="flex flex-wrap gap-2">
				<button
					onClick={() => onTagClick(null)}
					className={cn(
						"inline-flex items-center rounded-md px-3 py-1 text-sm font-medium transition-colors",
						activeTag === null
							? "bg-primary text-primary-foreground"
							: "bg-secondary/10 text-secondary-foreground hover:bg-secondary/20",
					)}
				>
					All
				</button>
				{tags.map((tag) => (
					<button
						key={tag}
						onClick={() => onTagClick(tag)}
						className={cn(
							"inline-flex items-center rounded-md px-3 py-1 text-sm font-medium transition-colors",
							activeTag === tag
								? "bg-primary text-primary-foreground"
								: "bg-secondary/10 text-secondary-foreground hover:bg-secondary/20",
						)}
					>
						{tag}
					</button>
				))}
			</div>
		</div>
	);
}

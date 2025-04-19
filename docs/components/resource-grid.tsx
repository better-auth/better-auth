import { cn } from "@/lib/utils";
import { ResourceCard } from "./resource-card";

interface ResourceGridProps {
	resources: {
		title: string;
		description: string;
		href: string;
		tags?: string[];
	}[];
	className?: string;
}

export function ResourceGrid({ resources, className }: ResourceGridProps) {
	return (
		<div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
			{resources.map((resource) => (
				<ResourceCard key={resource.href} {...resource} />
			))}
		</div>
	);
}

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { techStackIcons } from "./techstack-icons";

export const TechStackDisplay = ({
	skills,
	className,
}: {
	skills: string[];
	className?: string;
}) => {
	return (
		<div
			className={cn(
				"flex gap-7 flex-wrap mt-3 justify-center items-center max-w-4xl",
				className,
			)}
		>
			{skills.map((icon) => {
				return (
					<TooltipProvider delayDuration={50} key={icon}>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="transform duration-300 hover:rotate-12 transition-transform">
									{techStackIcons[icon].icon}
								</span>
							</TooltipTrigger>
							<TooltipContent>{techStackIcons[icon].name}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				);
			})}
		</div>
	);
};

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface TabProps {
	fileName: string;
	isActive: boolean;
	brightnessLevel?: number; // New optional prop for brightness level
	onClick: () => void;
	onClose: () => void;
}

const brightnessLevels = [
	"bg-background",
	"bg-background-200", //
	"bg-background-300",
	"bg-background-400",
	"bg-background-500",
	"bg-background-600",
	"bg-background-700",
];

export function CodeTab({
	fileName,
	isActive,
	brightnessLevel = 0,
	onClick,
	onClose,
}: TabProps) {
	const activeBrightnessClass = isActive
		? brightnessLevels[brightnessLevel % brightnessLevels.length]
		: "bg-muted";

	const textColor = isActive ? "text-foreground" : "text-muted-foreground";
	const borderColor = isActive
		? "border-t-foreground"
		: "border-t-transparent hover:bg-background/50";

	return (
		<div
			className={cn(
				"flex items-center px-3 py-2 text-sm font-medium border-t-2 cursor-pointer transition-colors duration-200",
				activeBrightnessClass,
				textColor,
				borderColor,
			)}
			onClick={onClick}
		>
			<span className="truncate max-w-[100px]">{fileName}</span>
			<button className="ml-2 text-muted-foreground hover:text-foreground transition-colors duration-200">
				<X size={14} />
			</button>
		</div>
	);
}

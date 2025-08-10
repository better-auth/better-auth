import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import {
	Settings,
	ShieldCheck,
	Package2,
	Terminal,
	GitBranch,
	Cpu,
	CircleCheck,
	Box,
	Plug,
	GitCommitHorizontal,
	Globe,
	MemoryStick,
	CircuitBoard,
	Brain,
	ServerCog,
	Container,
	AppWindow,
	TerminalSquare,
	CirclePlay,
} from "lucide-react";

const telemetryPoints = [
	{
		icon: GitCommitHorizontal,
		label: "Anonymous Project ID",
		title: "Unique project identifier, anonymized for privacy.",
	},
	{
		icon: ShieldCheck,
		label: "Sanitized Config",
		title:
			"Auth configuration options passed into Better Auth, cleaned of sensitive info.",
	},
	{ icon: Plug, label: "Enabled Plugins", title: "List of active plugins." },
	{
		icon: Settings,
		label: "Better Auth Version",
		title: "Current version of Better Auth.",
	},
	{
		icon: ServerCog,
		label: "Database",
		title: "Type and version of the database in use.",
	},
	{
		icon: Box,
		label: "Framework",
		title: "The framework powering the app and its version.",
	},
	{
		icon: Package2,
		label: "Package Manager",
		title: "The package manager in use and its version.",
	},
	{
		icon: Terminal,
		label: "Runtime",
		title: "The JavaScript runtime in use and its version.",
	},
	{ icon: Globe, label: "OS", title: "Operating system of the host machine." },
	{
		icon: CircuitBoard,
		label: "CPU Arch",
		title: "Processor architecture type.",
	},
	{ icon: Cpu, label: "CPU Count", title: "Number of CPU cores available." },
	{ icon: Brain, label: "CPU Model", title: "Model identifier of the CPU." },
	{
		icon: MemoryStick,
		label: "Total Memory",
		title: "Total system memory (RAM) installed.",
	},
	{
		icon: GitBranch,
		label: "isGit",
		title: "Indicates if the project is version controlled by Git.",
	},
	{
		icon: CircleCheck,
		label: "isProduction",
		title: "Flag showing if running in production mode.",
	},
	{
		icon: CirclePlay,
		label: "isCI",
		title:
			"Whether the code is running in a Continuous Integration environment.",
	},
	{
		icon: AppWindow,
		label: "isWSL",
		title: "True if running inside Windows Subsystem for Linux.",
	},
	{
		icon: Container,
		label: "isDocker",
		title: "True if running inside a Docker container.",
	},
	{
		icon: TerminalSquare,
		label: "isTTY",
		title: "True if running inside a TTY shell.",
	},
];

export default function Telemetry() {
	return (
		<TooltipProvider>
			<div className="flex flex-wrap gap-2">
				{telemetryPoints.map(({ icon: Icon, label, title }, index) => (
					<Tooltip key={index}>
						<TooltipTrigger asChild>
							<Badge
								variant="outline"
								className="flex items-center gap-1.5 cursor-help"
							>
								<Icon className="w-3.5 h-3.5" />
								{label}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							<p className="text-sm">{title}</p>
						</TooltipContent>
					</Tooltip>
				))}
			</div>
		</TooltipProvider>
	);
}

import { Badge } from "@/components/ui/badge";
import {
	Settings,
	ShieldCheck,
	Database,
	Package2,
	Terminal,
	GitBranch,
	Cpu,
	MonitorSmartphone,
	CircleCheck,
} from "lucide-react";
import { Grid } from "../blocks/features";

const telemetrySections = [
	{
		icon: ShieldCheck,
		title: "Auth Config",
		points: [{ label: "Sanitized config" }, { label: "Enabled plugins" }],
	},
	{
		icon: Settings,
		title: "Better Auth",
		points: [{ label: "Better Auth version" }],
	},
	{
		icon: Database,
		title: "Database",
		points: [{ label: "DB type" }, { label: "Driver version" }],
	},
	{
		icon: Package2,
		title: "Framework",
		points: [{ label: "Framework name" }, { label: "Framework version" }],
	},
	{
		icon: CircleCheck,
		title: "Production",
		points: [{ label: "Is production" }],
	},
	{
		icon: GitBranch,
		title: "Project Info",
		points: [
			{ label: "Uses Git" },
			{ label: "Anonymous Project ID" },
			{ label: "Package manager" },
		],
	},
	{
		icon: Terminal,
		title: "Runtime",
		points: [{ label: "Runtime name" }, { label: "Runtime version" }],
	},
	{
		icon: Cpu,
		title: "System Info",
		points: [
			{ label: "OS" },
			{ label: "CPU arch" },
			{ label: "CPU count" },
			{ label: "CPU model" },
			{ label: "Total memory" },
		],
	},
	{
		icon: MonitorSmartphone,
		title: "Environment",
		points: [
			{ label: "CI" },
			{ label: "WSL" },
			{ label: "Docker" },
			{ label: "TTY" },
		],
	},
];

export default function Telemetry() {
	return (
		<div className="py-2">
			<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-10 md:gap-2 max-w-7xl mx-auto">
				{telemetrySections.map(({ icon: Icon, title, points }, i) => (
					<div
						key={title}
						className="relative bg-gradient-to-b dark:from-neutral-900 from-neutral-100 dark:to-neutral-950 to-white px-6 py-4 overflow-hidden"
					>
						<Grid size={i * 5 + 10} />
						<div className="relative z-0 flex items-center gap-3 mb-4">
							<div className="bg-muted p-2 rounded-lg">
								<Icon className="w-4 h-4 text-muted-foreground" />
							</div>
							<h3 className="text-base text-lg !m-0 font-semibold text-neutral-800 dark:text-white">
								{title}
							</h3>
						</div>
						<div className="flex flex-wrap gap-2 relative z-0">
							{points.map((point, index) => (
								<Badge key={index} variant="outline">
									{point.label}
								</Badge>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

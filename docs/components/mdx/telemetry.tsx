import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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

const telemetrySections = [
	{
		icon: ShieldCheck,
		title: "Auth Config",
		points: [
			{ label: "Sanitized config" },
			{ label: "Enabled plugins" },
		],
	},
	{
		icon: Settings,
		title: "Better Auth",
		points: [{ label: "Auth version" }],
	},
	{
		icon: Database,
		title: "Database",
		points: [
			{ label: "DB type" },
			{ label: "Driver version" },
		],
	},
	{
		icon: Package2,
		title: "Framework",
		points: [
			{ label: "Framework name" },
			{ label: "Framework version" },
		],
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
		points: [
			{ label: "Runtime name" },
			{ label: "Runtime version" },
		],
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
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
				{telemetrySections.map(({ icon: Icon, title, points }, index) => (
					<Card key={index} className="rounded-2xl shadow-sm">
						<CardHeader className="flex flex-row items-center gap-3 pb-2">
							<div className="bg-muted p-2 rounded-xl">
								<Icon className="w-5 h-5 text-muted-foreground" />
							</div>
							<CardTitle className="text-base font-semibold">{title}</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2 pt-0 pb-4 px-4">
							{points.map((point, i) => (
								<Badge key={i} variant="outline">
									{point.label}
								</Badge>
							))}
						</CardContent>
					</Card>
				))}
			</div>
	);
}

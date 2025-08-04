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

const telemetryPoints = [
	{ icon: ShieldCheck, label: "Sanitized config" },
	{ icon: ShieldCheck, label: "Enabled plugins" },
	{ icon: Settings, label: "Better Auth version" },
	{ icon: Database, label: "DB type" },
	{ icon: Database, label: "DB Driver version" },
	{ icon: Package2, label: "Framework name" },
	{ icon: Package2, label: "Framework version" },
	{ icon: CircleCheck, label: "Is production" },
	{ icon: GitBranch, label: "Uses Git" },
	{ icon: GitBranch, label: "Anonymous Project ID" },
	{ icon: GitBranch, label: "Package manager" },
	{ icon: Terminal, label: "Runtime name" },
	{ icon: Terminal, label: "Runtime version" },
	{ icon: Cpu, label: "OS" },
	{ icon: Cpu, label: "CPU arch" },
	{ icon: Cpu, label: "CPU count" },
	{ icon: Cpu, label: "CPU model" },
	{ icon: Cpu, label: "Total memory" },
	{ icon: MonitorSmartphone, label: "isCI" },
	{ icon: MonitorSmartphone, label: "isWSL" },
	{ icon: MonitorSmartphone, label: "isDocker" },
	{ icon: MonitorSmartphone, label: "isTTY" },
];

export default function Telemetry() {
	return (
		<div className="flex flex-wrap gap-2">
			{telemetryPoints.map(({ icon: Icon, label }, index) => (
				<Badge
					key={index}
					variant="outline"
					className="flex items-center gap-1.5"
				>
					<Icon className="w-3.5 h-3.5" />
					{label}
				</Badge>
			))}
		</div>
	);
}

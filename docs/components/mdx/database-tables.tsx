import { Key, Link } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip-docs";

interface Field {
	name: string;
	type: string;
	description: string;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	isOptional?: boolean;
}

interface DatabaseTableProps {
	fields: Field[];
}

export default function DatabaseTable({ fields }: DatabaseTableProps) {
	return (
		<Table className="my-0">
			<TableHeader>
				<TableRow className="bg-primary/10 dark:bg-primary/20">
					<TableHead className="w-1/6">Field Name</TableHead>
					<TableHead className="w-1/6">Type</TableHead>
					<TableHead className="w-1/12">Key</TableHead>
					<TableHead className="w-1/2">Description</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{fields.map((field, index) => (
					<TableRow
						key={index}
						className={index % 2 === 0 ? "bga-muted/50" : ""}
					>
						<TableCell className="font-medium">{field.name}</TableCell>
						<TableCell className="font-mono text-sm">
							<Badge variant="outline">{field.type}</Badge>
						</TableCell>
						<TableCell>
							{field.isPrimaryKey && (
								<TooltipProvider delayDuration={0}>
									<Tooltip>
										<TooltipTrigger>
											<Badge
												variant="secondary"
												className="mr-1 rounded-sm bg-amber-500"
											>
												<Key className="w-3 h-3 mr-1" size={14} />
												PK
											</Badge>
										</TooltipTrigger>
										<TooltipContent>Primary Key</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
							{field.isForeignKey && (
								<TooltipProvider delayDuration={0}>
									<Tooltip>
										<TooltipTrigger>
											<Badge
												variant="secondary"
												className="mr-1 rounded-sm bg-blue-500"
											>
												<Link className="w-3 h-3 mr-1" size={14} />
												FK
											</Badge>
										</TooltipTrigger>
										<TooltipContent>Foreign Key</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
							{!field.isPrimaryKey &&
								!field.isForeignKey &&
								!field.isOptional && (
									<span className="text-muted text-center">-</span>
								)}
							{field.isOptional && (
								<TooltipProvider delayDuration={0}>
									<Tooltip>
										<TooltipTrigger>
											<Badge variant="outline">?</Badge>
										</TooltipTrigger>
										<TooltipContent>Optional</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
						</TableCell>
						<TableCell>{field.description}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Key, Link } from "lucide-react";
import { Label } from "../ui/label";

interface Field {
	name: string;
	type: string;
	description: string;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
}

interface DatabaseTableProps {
	fields: Field[];
}

export default function DatabaseTable({ fields }: DatabaseTableProps) {
	return (
		<div className="border">
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
									<Badge
										variant="secondary"
										className="mr-1 rounded-sm bg-amber-500"
									>
										<Key className="w-3 h-3 mr-1" size={14} />
										PK
									</Badge>
								)}
								{field.isForeignKey && (
									<Badge className="rounded-sm" variant="secondary">
										<Link className="w-3 h-3 mr-1" size={14} />
										FK
									</Badge>
								)}
								{!field.isPrimaryKey && !field.isForeignKey && (
									<span className="text-muted text-center">-</span>
								)}
							</TableCell>
							<TableCell>{field.description}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

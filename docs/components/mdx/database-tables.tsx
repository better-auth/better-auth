"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CopyIcon, Key, LinkIcon } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip-docs";
import { DBFieldAttribute } from "@/lib/copy-schema/types";
import { Button } from "../ui/button";
import { useCopySchemaDialog } from "@/components/copy-schema";
export interface DatabaseTableProps {
	modelName: string;
	fields: (
		| (DBFieldAttribute & {
				displayType?: string;
				description: string;
		  })
		| { note: string }
	)[];
	/**
	 * @default "create"
	 */
	mode?: "create" | "alter";
}

export default function DatabaseTable(props: DatabaseTableProps) {
	const { modelName, fields } = props;
	const { setOpen, setData } = useCopySchemaDialog();
	return (
		<div>
			<div className="-mb-2.5 flex items-end">
				<p className="my-0!">
					Table name: <code className="prose">{modelName}</code>
				</p>
				<Button
					className="ms-auto max-lg:size-8"
					size="sm"
					variant="outline"
					onClick={() => {
						setOpen((prev) => {
							if (!prev) {
								setData(props);
								return true;
							}
							return false;
						});
					}}
				>
					<CopyIcon className="size-4" aria-hidden="true" />
					<span className="max-lg:sr-only">Copy Schema</span>
				</Button>
			</div>
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
					{fields.map((field, index) => {
						if ("note" in field) {
							return (
								<TableRow
									key={index}
									className={index % 2 === 0 ? "bga-muted/50" : ""}
								>
									<TableCell colSpan={4}>{field.note}</TableCell>
								</TableRow>
							);
						}

						const isPrimaryKey = field.fieldName === "id";
						const isForeignKey = field.references !== undefined;
						const isOptional = field.required === false;

						return (
							<TableRow
								key={index}
								className={index % 2 === 0 ? "bga-muted/50" : ""}
							>
								<TableCell className="font-medium">{field.fieldName}</TableCell>
								<TableCell className="font-mono text-sm">
									<Badge variant="outline">
										{field.displayType || field.type === "date"
											? "Date"
											: field.type}
									</Badge>
								</TableCell>
								<TableCell>
									{isPrimaryKey && (
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
									{isForeignKey && (
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger>
													<Badge
														variant="secondary"
														className="mr-1 rounded-sm bg-blue-500"
													>
														<LinkIcon className="w-3 h-3 mr-1" size={14} />
														FK
													</Badge>
												</TooltipTrigger>
												<TooltipContent>Foreign Key</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									)}
									{!isPrimaryKey && !isForeignKey && !isOptional && (
										<span className="text-muted text-center">-</span>
									)}
									{isOptional && (
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
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

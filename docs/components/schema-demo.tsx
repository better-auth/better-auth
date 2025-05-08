"use client";

import {
	getLayoutedElements,
	getDetailedAuthTables,
} from "@/lib/schema-demo-utils";
import {
	type Node,
	type Edge,
	type NodeChange,
	type ColorMode,
	type EdgeChange,
	useNodesState,
	useEdgesState,
	applyEdgeChanges,
	applyNodeChanges,
	BackgroundVariant,
	ReactFlow,
	Background,
	Position,
	useReactFlow,
	ReactFlowProvider,
	Panel,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useCallback } from "react";
import { TableNode, type TableNodeData } from "./schema-demo-table-node";
import "@xyflow/react/dist/style.css";
import "./schema-demo-styles.css";
import type { FieldAttribute } from "better-auth/db";
import { CircleDot, CornerRightUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
	TooltipContent,
	Tooltip,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip-docs";

type BetterAuthDbSchema = {
	[key: string]: {
		fields: {
			[key: string]: FieldAttribute & { plugin: string };
		};
	};
};

export const SchemaDemo = ({
	plugin,
	focus,
	schema: schema_,
	includeDefaultSession,
	includeDefaultUser,
	includeDefaultAccount,
	includeDefaultVerifications,
	height = "default",
}: {
	plugin: string;
	/**
	 * A specific table to focus on mount. Defaults to the plugin name assuming a given table matches the plugin name.
	 *
	 * If you provide `all`, it will focus all nodes.
	 */
	focus?: string;
	schema: BetterAuthDbSchema;
	includeDefaultSession?: boolean;
	includeDefaultUser?: boolean;
	includeDefaultAccount?: boolean;
	includeDefaultVerifications?: boolean;
	/**
	 * The height of the schema demo.
	 *
	 * @default "default"
	 */
	height?: "default" | "large";
}) => {
	const schema = getDetailedAuthTables({
		plugins: [
			{
				id: plugin,
				schema: schema_,
			},
		],
	});

	if (!includeDefaultAccount) {
		// biome-ignore lint/performance/noDelete: <explanation>
		delete schema.account;
	}

	if (!includeDefaultSession) {
		// biome-ignore lint/performance/noDelete: <explanation>
		delete schema.session;
	}

	if (!includeDefaultUser) {
		// biome-ignore lint/performance/noDelete: <explanation>
		delete schema.user;
	}

	if (!includeDefaultVerifications) {
		// biome-ignore lint/performance/noDelete: <explanation>
		delete schema.verification;
	}

	const nodes: Node[] = useMemo(() => {
		const nodes: Node[] = [];
		if (!schema) return nodes;
		let i = 0;
		const table_width = 250;
		for (const [modelName, model] of Object.entries(schema)) {
			i++;
			const res = {
				id: modelName,
				position: { x: i * table_width, y: 0 },
				sourcePosition: Position.Right,
				targetPosition: Position.Left,
				data: {
					columns: Object.entries(model.fields).map(
						([fieldName, field]) =>
							({
								id: fieldName,
								//@ts-expect-error - In the future, BA will provide this.
								isPrimary: field.isPrimaryKey ?? false,
								isNullable: !field.required,
								isUnique: field.unique ?? false,
								name: field.fieldName ?? fieldName,
								format: (field.type as string | undefined) ?? "string",
								plugin: field.plugin ?? "",
								isIdentity: false,
							}) satisfies TableNodeData["columns"][number],
					),
					isForeign: false,
					name: modelName,
				} satisfies TableNodeData,
				type: "table",
			};
			nodes.push(res);
		}
		return nodes;
	}, [schema]);

	const edges: Edge[] = useMemo(() => {
		const edges: Edge[] = [];
		if (!schema) return edges;
		for (const [modelName, model] of Object.entries(schema)) {
			for (const [fieldName, field] of Object.entries(model.fields)) {
				if (field.references) {
					const res = {
						id: `${modelName}-${fieldName}-${field.references.model}-${field.references.field}`,
						source: field.references.model,
						sourceHandle: field.references.field,
						target: modelName,
						targetHandle: fieldName,
					};
					edges.push(res);
				}
			}
		}

		return edges;
	}, [schema]);

	return (
		<ReactFlowProvider>
			<div
				className={cn(
					"relative w-full ",
					height == "default" ? "aspect-video" : "aspect-square",
				)}
			>
				<SchemaFlow
					edges={edges}
					nodes={nodes}
					focusedTable={focus || nodes.find((x) => x.id === plugin)?.id || null}
				/>
			</div>
			<span className="flex items-center justify-end gap-2 pr-1 mt-2 text-sm text-muted-foreground">
				Pan and zoom to explore the schema.{" "}
				<CornerRightUp className="w-4 h-4" />
			</span>
		</ReactFlowProvider>
	);
};

interface SchemaFlowProps {
	nodes: Node[];
	edges: Edge[];
	focusedTable: string | null;
}

const SchemaFlow = ({
	focusedTable,
	nodes: initialNodes,
	edges: initialEdges,
}: SchemaFlowProps) => {
	const [nodes, setNodes] = useNodesState(initialNodes);
	const [edges, setEdges] = useEdgesState(initialEdges);
	const { theme } = useTheme();
	const reactFlowInstance = useReactFlow();

	const nodeTypes = useMemo(
		() => ({
			table: (props: any) => <TableNode {...props} placeholder />,
		}),
		[],
	);

	useEffect(() => {
		const layouted = getLayoutedElements(initialNodes, initialEdges);

		setNodes([...layouted.nodes]);
		setEdges([...layouted.edges]);
		const tid = setTimeout(() => {
			if (focusedTable && focusedTable !== "all") {
				reactFlowInstance.fitView({
					nodes: [layouted.nodes.find((x) => x.id === focusedTable)!],
				});
			} else {
				reactFlowInstance.fitView();
			}
		}, 100);
		return () => {
			clearTimeout(tid);
		};
	}, [initialNodes, initialEdges, setNodes, setEdges]);

	const onNodesChange = useCallback(
		(changes: NodeChange[]) => {
			setNodes((nds) => applyNodeChanges(changes, nds));
		},
		[setNodes],
	);

	const onEdgesChange = useCallback(
		(changes: EdgeChange[]) => {
			setEdges((eds) => applyEdgeChanges(changes, eds));
		},
		[setEdges],
	);

	return (
		<div className="absolute inset-0 overflow-hidden border rounded-lg border-border/80">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				colorMode={(theme as ColorMode | undefined) ?? "dark"}
				nodeTypes={nodeTypes}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				defaultEdgeOptions={{
					type: "smoothstep",
					animated: true,
					deletable: false,
					style: {
						stroke:
							"color-mix(in oklab, var(--color-fd-muted-foreground) 50%, transparent)",
						strokeWidth: 0.5,
					},
				}}
				fitView
				minZoom={0.8}
				proOptions={{ hideAttribution: true }}
				panOnScroll
				panOnScrollSpeed={1}
			>
				<Background
					gap={16}
					className="!bg-background"
					variant={BackgroundVariant.Dots}
					color={"inherit"}
				/>
				<Panel
					className={cn(
						"flex gap-1 rounded-md  p-1 text-foreground drop-shadow-md",
						" opacity-50 hover:opacity-100 transition-opacity duration-150 ease-in-out",
					)}
					position="bottom-right"
				>
					{/* @ts-expect-error - it works */}
					<TooltipProvider delayDuration={10}>
						{/* @ts-expect-error - it works */}
						<Tooltip>
							{/* @ts-expect-error - it works */}
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="cursor-pointer"
									onClick={() => {
										if (focusedTable && focusedTable !== "all") {
											reactFlowInstance.fitView({
												nodes: [nodes.find((x) => x.id === focusedTable)!],
												duration: 300,
											});
										} else {
											reactFlowInstance.fitView({
												duration: 300,
											});
										}
									}}
								>
									<CircleDot className="w-4 h-4" />
								</Button>
							</TooltipTrigger>
							{/* @ts-expect-error - it works */}
							<TooltipContent>Focus</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</Panel>
			</ReactFlow>
		</div>
	);
};

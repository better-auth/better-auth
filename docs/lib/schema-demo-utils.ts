import { Node, Edge } from "@xyflow/react";
import Dagre from "dagre";
import { Position } from "@xyflow/react";
import { FieldAttribute as BAFieldAttribute } from "better-auth/db";
import { BetterAuthOptions } from "better-auth";

export const TABLE_NODE_WIDTH = 640;
export const TABLE_NODE_ROW_HEIGHT = 100;

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
	const NODE_SEP = 25;
	const RANK_SEP = -300;
	const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "LR",
		align: "UR",
		nodesep: NODE_SEP,
		ranksep: RANK_SEP,
	});

	edges.forEach((edge) => g.setEdge(edge.source, edge.target));
	nodes.forEach((node) => {
		const rowHeight = 28;
		const theoreticalHeight =
			rowHeight * ((node.data.columns as any[]).length + 1);
		g.setNode(node.id, {
			...node,
			width: TABLE_NODE_WIDTH,
			height: theoreticalHeight,
		});
	});

	Dagre.layout(g);

	return {
		nodes: nodes.map((node) => {
			const position = g.node(node.id);
			node.targetPosition = Position.Left;
			node.sourcePosition = Position.Right;

			node.position = {
				x: position.x - position.width / 2,
				y: position.y - position.height / 2,
			};

			return node;
		}),
		edges,
	};
};

type FieldAttribute = BAFieldAttribute & { plugin: string };

type BetterAuthDbSchema = Record<
	string,
	{
		/**
		 * The name of the table in the database
		 */
		modelName: string;
		/**
		 * The fields of the table
		 */
		fields: Record<string, FieldAttribute>;
		/**
		 * Whether to disable migrations for this table
		 * @default false
		 */
		disableMigrations?: boolean;
		/**
		 * The order of the table
		 */
		order?: number;
	}
>;

export const getDetailedAuthTables = (
	options: BetterAuthOptions,
): BetterAuthDbSchema => {
	const idField = {
		type: "string",
		plugin: "",
		required: true,
		//@ts-expect-error - In the future, BA will provide this.
		isPrimaryKey: true,
	} satisfies FieldAttribute;

	const pluginSchema = options.plugins?.reduce(
		(acc, plugin) => {
			const schema = plugin.schema;
			if (!schema) return acc;
			for (const [key, value] of Object.entries(schema)) {
				const fields: Record<string, BAFieldAttribute> = value.fields || {};
				const updatedFields: Record<string, FieldAttribute> = {};
				const accumulatedFields: Record<string, FieldAttribute> =
					acc[key]?.fields || {};
				// biome-ignore lint/performance/noDelete: <explanation>
				delete accumulatedFields.id;
				for (const [fieldName, field] of Object.entries(fields)) {
					updatedFields[fieldName] = {
						...field,
						plugin: plugin.id,
					};
				}
				acc[key] = {
					fields: {
						id: idField,
						...accumulatedFields,
						...updatedFields,
					},
					modelName: value.modelName || key,
				};
			}
			return acc;
		},
		{} as Record<
			string,
			{ fields: Record<string, FieldAttribute>; modelName: string }
		>,
	);

	const shouldAddRateLimitTable = options.rateLimit?.storage === "database";
	const rateLimitTable = {
		rateLimit: {
			modelName: options.rateLimit?.modelName || "rateLimit",
			fields: {
				id: idField,
				key: {
					type: "string",
					fieldName: options.rateLimit?.fields?.key || "key",
					plugin: "",
				},
				count: {
					type: "number",
					fieldName: options.rateLimit?.fields?.count || "count",
					plugin: "",
				},
				lastRequest: {
					type: "number",
					bigint: true,
					fieldName: options.rateLimit?.fields?.lastRequest || "lastRequest",
					plugin: "",
				},
			},
		},
	} satisfies BetterAuthDbSchema;

	const { user, session, account, ...pluginTables } = pluginSchema || {};

	const sessionTable = {
		session: {
			modelName: options.session?.modelName || "session",
			fields: {
				id: idField,
				expiresAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.expiresAt || "expiresAt",
					plugin: "",
				},
				token: {
					type: "string",
					required: true,
					fieldName: options.session?.fields?.token || "token",
					plugin: "",
					unique: true,
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.createdAt || "createdAt",
					plugin: "",
				},
				updatedAt: {
					type: "date",
					required: true,
					fieldName: options.session?.fields?.updatedAt || "updatedAt",
					plugin: "",
				},
				ipAddress: {
					type: "string",
					required: false,
					fieldName: options.session?.fields?.ipAddress || "ipAddress",
					plugin: "",
				},
				userAgent: {
					type: "string",
					required: false,
					fieldName: options.session?.fields?.userAgent || "userAgent",
					plugin: "",
				},
				userId: {
					type: "string",
					fieldName: options.session?.fields?.userId || "userId",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
					plugin: "",
				},
				...session?.fields,
				...options.session?.additionalFields,
			},
			order: 2,
		},
	} satisfies BetterAuthDbSchema;

	const result = {
		user: {
			modelName: options.user?.modelName || "user",
			fields: {
				id: idField,
				name: {
					type: "string",
					required: true,
					fieldName: options.user?.fields?.name || "name",
					sortable: true,
					plugin: "",
				},
				email: {
					type: "string",
					unique: true,
					required: true,
					fieldName: options.user?.fields?.email || "email",
					sortable: true,
					plugin: "",
				},
				emailVerified: {
					type: "boolean",
					defaultValue: () => false,
					required: true,
					fieldName: options.user?.fields?.emailVerified || "emailVerified",
					plugin: "",
				},
				image: {
					type: "string",
					required: false,
					fieldName: options.user?.fields?.image || "image",
					plugin: "",
				},
				createdAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
					fieldName: options.user?.fields?.createdAt || "createdAt",
					plugin: "",
				},
				updatedAt: {
					type: "date",
					defaultValue: () => new Date(),
					required: true,
					fieldName: options.user?.fields?.updatedAt || "updatedAt",
					plugin: "",
				},
				...user?.fields,
				...options.user?.additionalFields,
			},
			order: 1,
		},
		//only add session table if it's not stored in secondary storage
		...(!options.secondaryStorage || options.session?.storeSessionInDatabase
			? sessionTable
			: {}),
		account: {
			modelName: options.account?.modelName || "account",
			fields: {
				id: idField,
				accountId: {
					type: "string",
					required: true,
					fieldName: options.account?.fields?.accountId || "accountId",
					plugin: "",
				},
				providerId: {
					type: "string",
					required: true,
					fieldName: options.account?.fields?.providerId || "providerId",
					plugin: "",
				},
				userId: {
					type: "string",
					references: {
						model: options.user?.modelName || "user",
						field: "id",
						onDelete: "cascade",
					},
					required: true,
					fieldName: options.account?.fields?.userId || "userId",
					plugin: "",
				},
				accessToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.accessToken || "accessToken",
					plugin: "",
				},
				refreshToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.refreshToken || "refreshToken",
					plugin: "",
				},
				idToken: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.idToken || "idToken",
					plugin: "",
				},
				accessTokenExpiresAt: {
					type: "date",
					required: false,
					fieldName:
						options.account?.fields?.accessTokenExpiresAt ||
						"accessTokenExpiresAt",
					plugin: "",
				},
				refreshTokenExpiresAt: {
					plugin: "",
					type: "date",
					required: false,
					fieldName:
						options.account?.fields?.accessTokenExpiresAt ||
						"refreshTokenExpiresAt",
				},
				scope: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.scope || "scope",
					plugin: "",
				},
				password: {
					type: "string",
					required: false,
					fieldName: options.account?.fields?.password || "password",
					plugin: "",
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.account?.fields?.createdAt || "createdAt",
					plugin: "",
				},
				updatedAt: {
					type: "date",
					required: true,
					fieldName: options.account?.fields?.updatedAt || "updatedAt",
					plugin: "",
				},
				...account?.fields,
			},
			order: 3,
		},
		verification: {
			modelName: options.verification?.modelName || "verification",
			fields: {
				id: idField,
				identifier: {
					type: "string",
					required: true,
					fieldName: options.verification?.fields?.identifier || "identifier",
					plugin: "",
				},
				value: {
					type: "string",
					required: true,
					fieldName: options.verification?.fields?.value || "value",
					plugin: "",
				},
				expiresAt: {
					type: "date",
					required: true,
					fieldName: options.verification?.fields?.expiresAt || "expiresAt",
					plugin: "",
				},
				createdAt: {
					type: "date",
					required: false,
					defaultValue: () => new Date(),
					fieldName: options.verification?.fields?.createdAt || "createdAt",
					plugin: "",
				},
				updatedAt: {
					type: "date",
					required: false,
					defaultValue: () => new Date(),
					fieldName: options.verification?.fields?.updatedAt || "updatedAt",
					plugin: "",
				},
			},
			order: 4,
		},
		...pluginTables,
		...(shouldAddRateLimitTable ? rateLimitTable : {}),
	} satisfies BetterAuthDbSchema;
	return result;
};

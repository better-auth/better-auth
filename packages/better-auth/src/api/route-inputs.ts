import type {
	BetterAuthOptions,
	BetterAuthRouteInputField,
	BetterAuthRouteInputs,
} from "@better-auth/core";
import type { Endpoint } from "better-call";
import * as z from "zod";

type RouteInputSource = {
	id: string;
	routeInputs?: BetterAuthRouteInputs | undefined;
};

type RouteInputDefinition = {
	field: BetterAuthRouteInputField;
	source: string;
};

type MergedRouteInputs = Record<string, Record<string, RouteInputDefinition>>;

function getRouteInputSources(options: BetterAuthOptions): RouteInputSource[] {
	return [
		...(options.plugins?.map((plugin) => ({
			id: `plugin:${plugin.id}`,
			routeInputs: plugin.routeInputs,
		})) ?? []),
		{
			id: "options.routeInputs",
			routeInputs: options.routeInputs,
		},
	];
}

function collectRouteInputs(options: BetterAuthOptions): MergedRouteInputs {
	const merged: MergedRouteInputs = {};
	for (const source of getRouteInputSources(options)) {
		if (!source.routeInputs) continue;
		for (const [path, fields] of Object.entries(source.routeInputs)) {
			merged[path] ??= {};
			for (const [name, field] of Object.entries(fields)) {
				const existing = merged[path][name];
				if (existing) {
					throw new Error(
						`Duplicate route input "${name}" for "${path}" from ${existing.source} and ${source.id}`,
					);
				}
				merged[path][name] = { field, source: source.id };
			}
		}
	}
	return merged;
}

function unwrapZodDef(schema: z.ZodType) {
	return (
		(schema as unknown as { _def?: any; def?: any })._def ??
		(schema as unknown as { def?: any }).def
	);
}

function getBodyKeys(schema: unknown): Set<string> {
	if (!schema || !(schema instanceof z.ZodType)) return new Set();
	if (schema instanceof z.ZodObject) {
		return new Set(Object.keys((schema as unknown as { shape: object }).shape));
	}
	if (schema instanceof z.ZodIntersection) {
		const def = unwrapZodDef(schema);
		return new Set([...getBodyKeys(def?.left), ...getBodyKeys(def?.right)]);
	}
	if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
		return getBodyKeys(schema.unwrap());
	}
	return new Set();
}

function createFieldSchema(field: BetterAuthRouteInputField): z.ZodType {
	let schema: z.ZodType;
	if (field.type === "json") {
		schema = (z as unknown as { json?: () => z.ZodType }).json?.() ?? z.any();
	} else if (field.type === "string[]") {
		schema = z.array(z.string());
	} else if (field.type === "number[]") {
		schema = z.array(z.number());
	} else if (Array.isArray(field.type)) {
		schema = field.type.length
			? z.enum(field.type as [string, ...string[]])
			: z.any();
	} else if (field.type === "date") {
		schema = z.date();
	} else if (field.type === "string") {
		schema = z.string();
	} else if (field.type === "number") {
		schema = z.number();
	} else if (field.type === "boolean") {
		schema = z.boolean();
	} else {
		schema = z.any();
	}
	if (field.description) {
		schema = schema.meta({ description: field.description });
	}
	if (field.required === false) {
		schema = schema.optional();
	}
	if (field.defaultValue !== undefined) {
		schema = schema.default(field.defaultValue as never);
	}
	return schema;
}

function createInputObject(fields: Record<string, RouteInputDefinition>) {
	return z.object(
		Object.fromEntries(
			Object.entries(fields).map(([name, definition]) => [
				name,
				createFieldSchema(definition.field),
			]),
		),
	);
}

function extendBodySchema(body: unknown, inputSchema: z.ZodObject<any>) {
	if (!body) return inputSchema;
	if (body instanceof z.ZodObject) {
		return body.extend(inputSchema.shape);
	}
	if (body instanceof z.ZodType) {
		return z.intersection(body, inputSchema);
	}
	throw new Error(
		"Route inputs can only extend endpoints with Zod request bodies",
	);
}

function getOpenAPIType(field: BetterAuthRouteInputField) {
	if (field.type === "string[]")
		return { type: "array", items: { type: "string" } };
	if (field.type === "number[]")
		return { type: "array", items: { type: "number" } };
	if (field.type === "json") return {};
	if (Array.isArray(field.type)) return { type: "string", enum: field.type };
	if (field.type === "date") return { type: "string", format: "date-time" };
	return { type: field.type };
}

function extendOpenAPIRequestBody(
	requestBody: any,
	fields: Record<string, RouteInputDefinition>,
) {
	if (!requestBody?.content?.["application/json"]?.schema) return requestBody;
	const schema = requestBody.content["application/json"].schema;
	schema.properties ??= {};
	const required = new Set<string>(schema.required ?? []);
	for (const [name, definition] of Object.entries(fields)) {
		schema.properties[name] = {
			...getOpenAPIType(definition.field),
			...(definition.field.description
				? { description: definition.field.description }
				: {}),
			...(definition.field.defaultValue !== undefined &&
			typeof definition.field.defaultValue !== "function"
				? { default: definition.field.defaultValue }
				: {}),
		};
		if (
			definition.field.required !== false &&
			definition.field.defaultValue === undefined
		) {
			required.add(name);
		}
	}
	schema.required = Array.from(required);
	return requestBody;
}

function extendEndpoint(
	endpoint: Endpoint,
	fields: Record<string, RouteInputDefinition>,
) {
	const bodyKeys = getBodyKeys(endpoint.options?.body);
	for (const name of Object.keys(fields)) {
		if (bodyKeys.has(name)) {
			throw new Error(
				`Route input "${name}" for "${endpoint.path}" conflicts with an existing endpoint body field`,
			);
		}
	}
	const inputSchema = createInputObject(fields);
	const extended = ((context: unknown) =>
		(endpoint as unknown as (context: unknown) => unknown)(
			context,
		)) as Endpoint;
	Object.assign(extended, endpoint);
	const metadata = {
		...(endpoint.options?.metadata ?? {}),
		routeInputSchema: inputSchema,
	};
	if (metadata.openapi?.requestBody) {
		metadata.openapi = {
			...metadata.openapi,
			requestBody: extendOpenAPIRequestBody(
				structuredClone(metadata.openapi.requestBody),
				fields,
			),
		};
	}
	(extended as any).options = {
		...endpoint.options,
		body: extendBodySchema(endpoint.options?.body, inputSchema),
		metadata,
	};
	return extended;
}

export function applyRouteInputs<const E extends Record<string, Endpoint>>(
	endpoints: E,
	options: BetterAuthOptions,
): E {
	const routeInputs = collectRouteInputs(options);
	if (!Object.keys(routeInputs).length) return endpoints;
	const extended: Record<string, Endpoint> = {};
	for (const [key, endpoint] of Object.entries(endpoints)) {
		const fields = endpoint.path ? routeInputs[endpoint.path] : undefined;
		extended[key] = fields ? extendEndpoint(endpoint, fields) : endpoint;
	}
	return extended as E;
}

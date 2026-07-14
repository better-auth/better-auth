import { HIDE_METADATA } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import {
	SCIMGroupResourceSchema,
	SCIMGroupResourceType,
} from "./group-schemas";
import { createSCIMError, SCIMErrorOpenAPISchemas } from "./scim-error";
import {
	ResourceTypeOpenAPISchema,
	SCIMSchemaOpenAPISchema,
	ServiceProviderOpenAPISchema,
} from "./scim-metadata";
import { SCIMUserResourceSchema, SCIMUserResourceType } from "./user-schemas";
import { getResourceURL } from "./utils";

const SCIM_LIST_RESPONSE_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA =
	"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const SCIM_MEDIA_TYPES = ["application/json", "application/scim+json"];
const SCIM_FILTER_MAX_RESULTS = 100;

const supportedSCIMSchemas = [SCIMUserResourceSchema, SCIMGroupResourceSchema];
const supportedSCIMResourceTypes = [
	SCIMUserResourceType,
	SCIMGroupResourceType,
];

function createListResponseOpenAPISchema<T extends Record<string, unknown>>(
	resourceSchema: T,
) {
	return {
		type: "object",
		properties: {
			schemas: {
				type: "array",
				items: { type: "string" },
			},
			totalResults: { type: "number" },
			itemsPerPage: { type: "number" },
			startIndex: { type: "number" },
			Resources: {
				type: "array",
				items: resourceSchema,
			},
		},
	} as const;
}

function createListResponse<T>(resources: T[]) {
	return {
		schemas: [SCIM_LIST_RESPONSE_SCHEMA],
		totalResults: resources.length,
		startIndex: 1,
		itemsPerPage: resources.length,
		Resources: resources,
	};
}

export const getSCIMServiceProviderConfig = createAuthEndpoint(
	"/scim/v2/ServiceProviderConfig",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: SCIM_MEDIA_TYPES,
			openapi: {
				summary: "Get SCIM service provider configuration",
				description:
					"Describes the SCIM protocol features supported by this service provider.",
				responses: {
					"200": {
						description: "SCIM service provider configuration",
						content: {
							"application/json": {
								schema: ServiceProviderOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			schemas: [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
			patch: { supported: true },
			bulk: {
				supported: false,
				maxOperations: 0,
				maxPayloadSize: 0,
			},
			filter: {
				supported: true,
				maxResults: SCIM_FILTER_MAX_RESULTS,
			},
			changePassword: { supported: false },
			sort: { supported: false },
			etag: { supported: false },
			authenticationSchemes: [
				{
					name: "OAuth Bearer Token",
					description:
						"Authentication using a bearer token in the Authorization header.",
					specUri: "https://www.rfc-editor.org/info/rfc6750",
					type: "oauthbearertoken",
					primary: true,
				},
			],
			meta: {
				resourceType: "ServiceProviderConfig",
				location: getResourceURL(
					"/scim/v2/ServiceProviderConfig",
					ctx.context.baseURL,
				),
			},
		});
	},
);

export const getSCIMSchemas = createAuthEndpoint(
	"/scim/v2/Schemas",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: SCIM_MEDIA_TYPES,
			openapi: {
				summary: "List SCIM schemas",
				description:
					"Lists the resource schemas supported by this SCIM service provider.",
				responses: {
					"200": {
						description: "SCIM schema ListResponse",
						content: {
							"application/json": {
								schema: createListResponseOpenAPISchema(
									SCIMSchemaOpenAPISchema,
								),
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const schemas = supportedSCIMSchemas.map((schema) => ({
			...schema,
			meta: {
				...schema.meta,
				location: getResourceURL(schema.meta.location, ctx.context.baseURL),
			},
		}));

		return ctx.json(createListResponse(schemas));
	},
);

export const getSCIMSchema = createAuthEndpoint(
	"/scim/v2/Schemas/:schemaId",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: SCIM_MEDIA_TYPES,
			openapi: {
				summary: "Get a SCIM schema",
				description:
					"Returns one resource schema supported by this SCIM service provider.",
				responses: {
					"200": {
						description: "SCIM schema",
						content: {
							"application/json": {
								schema: SCIMSchemaOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const schema = supportedSCIMSchemas.find(
			(supportedSchema) => supportedSchema.id === ctx.params.schemaId,
		);
		if (!schema) {
			throw createSCIMError("NOT_FOUND", {
				detail: "Schema not found",
			});
		}

		return ctx.json({
			...schema,
			meta: {
				...schema.meta,
				location: getResourceURL(schema.meta.location, ctx.context.baseURL),
			},
		});
	},
);

export const getSCIMResourceTypes = createAuthEndpoint(
	"/scim/v2/ResourceTypes",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: SCIM_MEDIA_TYPES,
			openapi: {
				summary: "List SCIM resource types",
				description:
					"Lists the resource types supported by this SCIM service provider.",
				responses: {
					"200": {
						description: "SCIM resource type ListResponse",
						content: {
							"application/json": {
								schema: createListResponseOpenAPISchema(
									ResourceTypeOpenAPISchema,
								),
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const resourceTypes = supportedSCIMResourceTypes.map((resourceType) => ({
			...resourceType,
			meta: {
				...resourceType.meta,
				location: getResourceURL(
					resourceType.meta.location,
					ctx.context.baseURL,
				),
			},
		}));

		return ctx.json(createListResponse(resourceTypes));
	},
);

export const getSCIMResourceType = createAuthEndpoint(
	"/scim/v2/ResourceTypes/:resourceTypeId",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: SCIM_MEDIA_TYPES,
			openapi: {
				summary: "Get a SCIM resource type",
				description:
					"Returns one resource type supported by this SCIM service provider.",
				responses: {
					"200": {
						description: "SCIM resource type",
						content: {
							"application/json": {
								schema: ResourceTypeOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const resourceType = supportedSCIMResourceTypes.find(
			(supportedResourceType) =>
				supportedResourceType.id === ctx.params.resourceTypeId,
		);
		if (!resourceType) {
			throw createSCIMError("NOT_FOUND", {
				detail: "Resource type not found",
			});
		}

		return ctx.json({
			...resourceType,
			meta: {
				...resourceType.meta,
				location: getResourceURL(
					resourceType.meta.location,
					ctx.context.baseURL,
				),
			},
		});
	},
);

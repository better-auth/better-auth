import * as z from "zod";

/** Maximum number of resources returned by one classic SCIM page. */
const SCIM_MAX_PAGE_SIZE = 100;

export type SCIMResourceType = "User" | "Group";

export type SCIMUserFilterAttribute =
	| "id"
	| "userName"
	| "externalId"
	| "emails.value"
	| "emails.work.value";

export type SCIMGroupFilterAttribute = "id" | "displayName" | "externalId";

export interface SCIMEqualityFilter<Attribute extends string> {
	attribute: Attribute;
	operator: "eq";
	value: string;
}

export interface SCIMClassicPagination {
	/** One-based index of the first requested resource. */
	startIndex: number;
	/** Zero-based database offset derived from `startIndex`. */
	offset: number;
	/** Requested page size after applying the server maximum. */
	count: number;
}

export type SCIMAttributeProjection =
	| { mode: "default" }
	| { mode: "include"; attributes: ReadonlySet<string> }
	| { mode: "exclude"; excludedAttributes: ReadonlySet<string> };

export type SCIMCollectionQueryInput = {
	filter?: string;
	startIndex?: number | string;
	count?: number | string;
	attributes?: string | readonly string[];
	excludedAttributes?: string | readonly string[];
};

/** HTTP query shape shared by resource-returning SCIM endpoints. */
export const scimAttributeProjectionQuerySchema = z.object({
	attributes: z.union([z.string(), z.array(z.string())]).optional(),
	excludedAttributes: z.union([z.string(), z.array(z.string())]).optional(),
});

/** HTTP query shape shared by the User and Group collection endpoints. */
export const scimCollectionQuerySchema =
	scimAttributeProjectionQuerySchema.extend({
		filter: z.string().optional(),
		startIndex: z.union([z.string(), z.number()]).optional(),
		count: z.union([z.string(), z.number()]).optional(),
	});

export type SCIMCollectionQueryError =
	| {
			code: "invalid-start-index";
			parameter: "startIndex";
			scimType: "invalidValue";
			detail: string;
	  }
	| {
			code: "invalid-count";
			parameter: "count";
			scimType: "invalidValue";
			detail: string;
	  }
	| {
			code: "invalid-filter-syntax";
			parameter: "filter";
			scimType: "invalidFilter";
			detail: string;
	  }
	| {
			code: "unsupported-filter-operator";
			parameter: "filter";
			scimType: "invalidFilter";
			detail: string;
	  }
	| {
			code: "unsupported-filter-attribute";
			parameter: "filter";
			scimType: "invalidFilter";
			detail: string;
	  }
	| {
			code: "invalid-filter-value";
			parameter: "filter";
			scimType: "invalidFilter";
			detail: string;
	  }
	| {
			code: "invalid-attribute-list";
			parameter: "attributes" | "excludedAttributes";
			scimType: "invalidValue";
			detail: string;
	  }
	| {
			code: "conflicting-attribute-projection";
			parameter: "attributes";
			scimType: "invalidValue";
			detail: string;
	  };

export type SCIMQueryParseResult<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: SCIMCollectionQueryError };

export interface SCIMCollectionQuery<Attribute extends string> {
	filters: readonly SCIMEqualityFilter<Attribute>[];
	pagination: SCIMClassicPagination;
	projection: SCIMAttributeProjection;
}

type SCIMFilterAttribute = SCIMUserFilterAttribute | SCIMGroupFilterAttribute;

function stripCoreSchemaPrefix(
	resourceType: SCIMResourceType,
	attribute: string,
): string {
	const schemaPrefix =
		resourceType === "User"
			? "urn:ietf:params:scim:schemas:core:2.0:user:"
			: "urn:ietf:params:scim:schemas:core:2.0:group:";
	return attribute.toLowerCase().startsWith(schemaPrefix)
		? attribute.slice(schemaPrefix.length)
		: attribute;
}

function parseInteger(
	input: number | string | undefined,
	parameter: "startIndex" | "count",
): SCIMQueryParseResult<number | undefined> {
	if (input === undefined) return { ok: true, value: undefined };

	const parsed =
		typeof input === "number"
			? input
			: /^-?\d+$/.test(input.trim())
				? Number(input.trim())
				: Number.NaN;

	if (!Number.isSafeInteger(parsed)) {
		return {
			ok: false,
			error:
				parameter === "startIndex"
					? {
							code: "invalid-start-index",
							parameter,
							scimType: "invalidValue",
							detail: "startIndex must be an integer",
						}
					: {
							code: "invalid-count",
							parameter,
							scimType: "invalidValue",
							detail: "count must be an integer",
						},
		};
	}

	return { ok: true, value: parsed };
}

/** Parse and normalize RFC 7644 classic pagination parameters. */
function parseSCIMClassicPagination(input: {
	startIndex?: number | string;
	count?: number | string;
}): SCIMQueryParseResult<SCIMClassicPagination> {
	const parsedStartIndex = parseInteger(input.startIndex, "startIndex");
	if (!parsedStartIndex.ok) return parsedStartIndex;

	const parsedCount = parseInteger(input.count, "count");
	if (!parsedCount.ok) return parsedCount;

	const startIndex = Math.max(parsedStartIndex.value ?? 1, 1);
	const count = Math.min(
		Math.max(parsedCount.value ?? SCIM_MAX_PAGE_SIZE, 0),
		SCIM_MAX_PAGE_SIZE,
	);

	return {
		ok: true,
		value: {
			startIndex,
			offset: startIndex - 1,
			count,
		},
	};
}

function canonicalizeFilterAttribute(
	resourceType: SCIMResourceType,
	attribute: string,
): SCIMFilterAttribute | undefined {
	// cspell:ignore typeeq
	const normalizedAttribute = stripCoreSchemaPrefix(resourceType, attribute);
	const compactAttribute = normalizedAttribute
		.replace(/\s+/g, "")
		.toLowerCase();
	switch (compactAttribute) {
		case "id":
			return "id";
		case "externalid":
			return "externalId";
		case "username":
			return resourceType === "User" ? "userName" : undefined;
		case "emails.value":
			return resourceType === "User" ? "emails.value" : undefined;
		case 'emails[typeeq"work"].value':
			return resourceType === "User" ? "emails.work.value" : undefined;
		case "displayname":
			return resourceType === "Group" ? "displayName" : undefined;
		default:
			return undefined;
	}
}

function parseSCIMEqualityFilter(
	resourceType: "User",
	filter?: string,
): SCIMQueryParseResult<
	SCIMEqualityFilter<SCIMUserFilterAttribute> | undefined
>;
function parseSCIMEqualityFilter(
	resourceType: "Group",
	filter?: string,
): SCIMQueryParseResult<
	SCIMEqualityFilter<SCIMGroupFilterAttribute> | undefined
>;
/** Parse the deliberately small P0 equality-filter grammar. */
function parseSCIMEqualityFilter(
	resourceType: SCIMResourceType,
	filter?: string,
): SCIMQueryParseResult<SCIMEqualityFilter<SCIMFilterAttribute> | undefined> {
	if (filter === undefined || filter.trim() === "") {
		return { ok: true, value: undefined };
	}

	const match = filter.trim().match(/^([\s\S]+)\s+([A-Za-z]+)\s+([\s\S]+)$/);
	if (!match) {
		return {
			ok: false,
			error: {
				code: "invalid-filter-syntax",
				parameter: "filter",
				scimType: "invalidFilter",
				detail: 'filter must use the form attribute eq "value"',
			},
		};
	}

	const [, rawAttribute, rawOperator, rawValue] = match;
	if (rawOperator?.toLowerCase() !== "eq") {
		return {
			ok: false,
			error: {
				code: "unsupported-filter-operator",
				parameter: "filter",
				scimType: "invalidFilter",
				detail: `filter operator ${rawOperator ?? ""} is not supported`,
			},
		};
	}

	const attribute = canonicalizeFilterAttribute(
		resourceType,
		rawAttribute?.trim() ?? "",
	);
	if (!attribute) {
		return {
			ok: false,
			error: {
				code: "unsupported-filter-attribute",
				parameter: "filter",
				scimType: "invalidFilter",
				detail: `filter attribute ${rawAttribute ?? ""} is not supported for ${resourceType}`,
			},
		};
	}

	let value: unknown;
	try {
		value = JSON.parse(rawValue ?? "");
	} catch {
		return {
			ok: false,
			error: {
				code: "invalid-filter-value",
				parameter: "filter",
				scimType: "invalidFilter",
				detail: "filter equality value must be a valid quoted JSON string",
			},
		};
	}

	if (typeof value !== "string") {
		return {
			ok: false,
			error: {
				code: "invalid-filter-value",
				parameter: "filter",
				scimType: "invalidFilter",
				detail: "filter equality value must be a quoted string",
			},
		};
	}

	return {
		ok: true,
		value: { attribute, operator: "eq", value },
	};
}

function splitFilterConjunction(
	filter: string,
): SCIMQueryParseResult<readonly string[]> {
	const expressions: string[] = [];
	let expressionStart = 0;
	let bracketDepth = 0;
	let quoted = false;
	let escaped = false;

	for (let index = 0; index < filter.length; index += 1) {
		const character = filter[index];
		if (quoted) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === "\\") {
				escaped = true;
				continue;
			}
			if (character === '"') quoted = false;
			continue;
		}

		if (character === '"') {
			quoted = true;
			continue;
		}
		if (character === "[") {
			bracketDepth += 1;
			continue;
		}
		if (character === "]") {
			bracketDepth -= 1;
			if (bracketDepth < 0) break;
			continue;
		}
		if (bracketDepth !== 0) continue;

		const token = filter.slice(index, index + 3);
		const before = filter[index - 1];
		const after = filter[index + 3];
		if (
			token.toLowerCase() === "and" &&
			before !== undefined &&
			after !== undefined &&
			/\s/.test(before) &&
			/\s/.test(after)
		) {
			const expression = filter.slice(expressionStart, index).trim();
			if (!expression) break;
			expressions.push(expression);
			expressionStart = index + 3;
			index += 2;
		}
	}

	const finalExpression = filter.slice(expressionStart).trim();
	if (
		quoted ||
		bracketDepth !== 0 ||
		!finalExpression ||
		expressions.length >= 10
	) {
		return {
			ok: false,
			error: {
				code: "invalid-filter-syntax",
				parameter: "filter",
				scimType: "invalidFilter",
				detail:
					expressions.length >= 10
						? "filter supports at most 10 equality expressions"
						: "filter contains an invalid conjunction",
			},
		};
	}
	expressions.push(finalExpression);
	return { ok: true, value: expressions };
}

function parseSCIMFilter(
	resourceType: "User",
	filter?: string,
): SCIMQueryParseResult<readonly SCIMEqualityFilter<SCIMUserFilterAttribute>[]>;
function parseSCIMFilter(
	resourceType: "Group",
	filter?: string,
): SCIMQueryParseResult<
	readonly SCIMEqualityFilter<SCIMGroupFilterAttribute>[]
>;
/** Parse the supported conjunction of case-insensitive equality expressions. */
function parseSCIMFilter(
	resourceType: SCIMResourceType,
	filter?: string,
): SCIMQueryParseResult<readonly SCIMEqualityFilter<SCIMFilterAttribute>[]> {
	if (filter === undefined || filter.trim() === "") {
		return { ok: true, value: [] };
	}
	const expressions = splitFilterConjunction(filter);
	if (!expressions.ok) return expressions;

	const filters: SCIMEqualityFilter<SCIMFilterAttribute>[] = [];
	for (const expression of expressions.value) {
		const parsed =
			resourceType === "User"
				? parseSCIMEqualityFilter("User", expression)
				: parseSCIMEqualityFilter("Group", expression);
		if (!parsed.ok) return parsed;
		if (parsed.value) filters.push(parsed.value);
	}
	return { ok: true, value: filters };
}

function normalizeAttributeList(
	resourceType: SCIMResourceType,
	input: string | readonly string[] | undefined,
	parameter: "attributes" | "excludedAttributes",
): SCIMQueryParseResult<ReadonlySet<string> | undefined> {
	if (input === undefined) return { ok: true, value: undefined };
	const values = typeof input === "string" ? [input] : input;
	if (values.length === 0) return { ok: true, value: undefined };

	const attributes = new Set<string>();
	for (const value of values) {
		if (value.trim() === "") continue;
		for (const part of value.split(",")) {
			const attribute = part.trim();
			if (!attribute || !/^\S+$/.test(attribute)) {
				return {
					ok: false,
					error: {
						code: "invalid-attribute-list",
						parameter,
						scimType: "invalidValue",
						detail: `${parameter} must be a comma-separated list of attribute paths`,
					},
				};
			}
			const normalizedAttribute = stripCoreSchemaPrefix(
				resourceType,
				attribute,
			);
			attributes.add(normalizedAttribute.toLowerCase());
		}
	}

	return attributes.size > 0
		? { ok: true, value: attributes }
		: { ok: true, value: undefined };
}

/** Parse mutually exclusive response attribute projection parameters. */
export function parseSCIMAttributeProjection(
	resourceType: SCIMResourceType,
	input: {
		attributes?: string | readonly string[];
		excludedAttributes?: string | readonly string[];
	},
): SCIMQueryParseResult<SCIMAttributeProjection> {
	const attributes = normalizeAttributeList(
		resourceType,
		input.attributes,
		"attributes",
	);
	if (!attributes.ok) return attributes;

	const excludedAttributes = normalizeAttributeList(
		resourceType,
		input.excludedAttributes,
		"excludedAttributes",
	);
	if (!excludedAttributes.ok) return excludedAttributes;

	if (attributes.value && excludedAttributes.value) {
		return {
			ok: false,
			error: {
				code: "conflicting-attribute-projection",
				parameter: "attributes",
				scimType: "invalidValue",
				detail: "attributes and excludedAttributes cannot be used together",
			},
		};
	}

	if (attributes.value) {
		return {
			ok: true,
			value: { mode: "include", attributes: attributes.value },
		};
	}
	if (excludedAttributes.value) {
		return {
			ok: true,
			value: {
				mode: "exclude",
				excludedAttributes: excludedAttributes.value,
			},
		};
	}
	return { ok: true, value: { mode: "default" } };
}

export function parseSCIMCollectionQuery(
	resourceType: "User",
	input: SCIMCollectionQueryInput,
): SCIMQueryParseResult<SCIMCollectionQuery<SCIMUserFilterAttribute>>;
export function parseSCIMCollectionQuery(
	resourceType: "Group",
	input: SCIMCollectionQueryInput,
): SCIMQueryParseResult<SCIMCollectionQuery<SCIMGroupFilterAttribute>>;
/** Parse endpoint input into a typed, resource-specific collection query. */
export function parseSCIMCollectionQuery(
	resourceType: SCIMResourceType,
	input: SCIMCollectionQueryInput,
): SCIMQueryParseResult<SCIMCollectionQuery<SCIMFilterAttribute>> {
	const pagination = parseSCIMClassicPagination(input);
	if (!pagination.ok) return pagination;

	const filters =
		resourceType === "User"
			? parseSCIMFilter("User", input.filter)
			: parseSCIMFilter("Group", input.filter);
	if (!filters.ok) return filters;

	const projection = parseSCIMAttributeProjection(resourceType, input);
	if (!projection.ok) return projection;

	return {
		ok: true,
		value: {
			filters: filters.value,
			pagination: pagination.value,
			projection: projection.value,
		},
	};
}

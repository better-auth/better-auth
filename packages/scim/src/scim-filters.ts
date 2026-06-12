import type { Where } from "better-auth";
import { SCIMGroupResourceSchema } from "./group-schemas";
import { SCIMUserResourceSchema } from "./user-schemas";

export type SCIMFilterWhere = Pick<
	Where,
	"field" | "mode" | "operator" | "value"
>;

type SCIMFilterOperator = NonNullable<Where["operator"]>;
type SCIMSchemaAttribute = {
	name: string;
	caseExact?: boolean | undefined;
};
type SCIMResourceFilterSchema = {
	attributes: readonly SCIMSchemaAttribute[];
};
type SCIMFilterAttributeFieldMap = Record<string, string>;

const SCIMFilterOperatorMap: Record<string, SCIMFilterOperator | undefined> = {
	eq: "eq",
};

const SCIMUserFilterAttributeFields = {
	userName: "email",
} as const satisfies SCIMFilterAttributeFieldMap;

const SCIMGroupFilterAttributeFields = {
	displayName: "displayName",
} as const satisfies SCIMFilterAttributeFieldMap;

export class SCIMParseError extends Error {}

const SCIMFilterRegex =
	/^\s*(?<attribute>[^\s]+)\s+(?<op>eq|ne|co|sw|ew|pr)\s*(?:(?<value>"[^"]*"|[^\s]+))?\s*$/i;

const parseSCIMFilterExpression = (filter: string) => {
	const match = filter.match(SCIMFilterRegex);
	if (!match) {
		throw new SCIMParseError("Invalid filter expression");
	}

	const attribute = match.groups?.attribute;
	const op = match.groups?.op?.toLowerCase();
	const value = match.groups?.value;

	if (!attribute || !op || !value) {
		throw new SCIMParseError("Invalid filter expression");
	}

	const operator = SCIMFilterOperatorMap[op];
	if (!operator) {
		throw new SCIMParseError(`The operator "${op}" is not supported`);
	}

	return { attribute, operator, value };
};

function findFilterAttributeField(
	attribute: string,
	attributeFieldMap: SCIMFilterAttributeFieldMap,
) {
	const normalizedAttribute = attribute.toLowerCase();
	return Object.entries(attributeFieldMap).find(([scimAttribute]) => {
		return scimAttribute.toLowerCase() === normalizedAttribute;
	});
}

function findSchemaAttribute(
	attribute: string,
	resourceSchema: SCIMResourceFilterSchema,
) {
	const normalizedAttribute = attribute.toLowerCase();
	return resourceSchema.attributes.find((schemaAttribute) => {
		return schemaAttribute.name.toLowerCase() === normalizedAttribute;
	});
}

function unquoteFilterValue(value: string) {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	return value;
}

const parseSCIMResourceFilter = (
	filter: string,
	input: {
		resourceSchema: SCIMResourceFilterSchema;
		attributeFieldMap: SCIMFilterAttributeFieldMap;
	},
): SCIMFilterWhere[] => {
	const { attribute, operator, value } = parseSCIMFilterExpression(filter);

	const mappedAttribute = findFilterAttributeField(
		attribute,
		input.attributeFieldMap,
	);
	const resourceAttribute = findSchemaAttribute(
		attribute,
		input.resourceSchema,
	);

	if (!mappedAttribute || !resourceAttribute) {
		throw new SCIMParseError(`The attribute "${attribute}" is not supported`);
	}

	const [, field] = mappedAttribute;

	return [
		{
			field,
			value: unquoteFilterValue(value),
			operator,
			...(resourceAttribute.caseExact === false
				? { mode: "insensitive" as const }
				: {}),
		},
	];
};

export const parseSCIMUserFilter = (filter: string) => {
	return parseSCIMResourceFilter(filter, {
		resourceSchema: SCIMUserResourceSchema,
		attributeFieldMap: SCIMUserFilterAttributeFields,
	});
};

export const parseSCIMGroupFilter = (filter: string) => {
	return parseSCIMResourceFilter(filter, {
		resourceSchema: SCIMGroupResourceSchema,
		attributeFieldMap: SCIMGroupFilterAttributeFields,
	});
};

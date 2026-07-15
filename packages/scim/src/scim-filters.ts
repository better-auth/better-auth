import { SCIMUserResourceSchema } from "./user-schemas";

export type DBFilter = {
	field: string;
	value: string | string[];
	operator?: any;
};

const SCIMOperators: Record<string, string | undefined> = {
	eq: "eq",
};

const SCIMUserAttributes: Record<string, string | undefined> = {
	userName: "email",
};

export class SCIMParseError extends Error {}

const SCIMFilterRegex =
	/^\s*(?<attribute>[^\s]+)\s+(?<op>eq|ne|co|sw|ew|pr)\s*(?:(?<value>"[^"]*"|[^\s]+))?\s*$/i;

/**
 * Parses a raw SCIM filter expression into its attribute/operator/value parts
 * without mapping the attribute to a database field. Exposed for callers
 * (like the `externalId` filter on `GET /scim/v2/Users`) that need to resolve
 * an attribute against a different model than the generic `SCIMUserAttributes`
 * map targets.
 */
export const parseSCIMFilter = (filter: string) => {
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

	const operator = SCIMOperators[op];
	if (!operator) {
		throw new SCIMParseError(`The operator "${op}" is not supported`);
	}

	return { attribute, operator, value };
};

export const parseSCIMUserFilter = (filter: string) => {
	const { attribute, operator, value } = parseSCIMFilter(filter);

	const filters: DBFilter[] = [];
	const targetAttribute = SCIMUserAttributes[attribute];
	const resourceAttribute = SCIMUserResourceSchema.attributes.find(
		(attr) => attr.name === attribute,
	);

	if (!targetAttribute || !resourceAttribute) {
		throw new SCIMParseError(`The attribute "${attribute}" is not supported`);
	}

	let finalValue = value.replaceAll('"', "");
	if (!resourceAttribute.caseExact) {
		finalValue = finalValue.toLowerCase();
	}

	filters.push({
		field: targetAttribute,
		value: finalValue,
		operator,
	});

	return filters;
};

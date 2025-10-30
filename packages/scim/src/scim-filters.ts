type DBFilter = { field: string; value: string; operator: any };

const SCIMOperators: Record<string, string | undefined> = {
	eq: "eq",
};

const SCIMUserAttributes: Record<string, string | undefined> = {
	userName: "email",
};

export class SCIMParseError extends Error {}

const parseSCIMFilter = (filter: string) => {
	const [attribute, op, value, ...other] = filter.split(" ");

	if (!attribute || !op || !value || other.length !== 0) {
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

	if (!targetAttribute) {
		throw new SCIMParseError(`The attribute "${attribute}" is not supported`);
	}

	filters.push({
		field: targetAttribute,
		value: value.replaceAll('"', ""),
		operator,
	});

	return filters;
};

import type { User } from "better-auth";
import { getUserFullName } from "./mappings";

type Operation = {
	op: "add" | "remove" | "replace";
	value: any;
	path?: string;
};

type Mapping = {
	target: string;
	resource: "user" | "account";
	map: (user: User, op: Operation, resources: Resources) => any;
};

type Resources = {
	user: Record<string, any>;
	account: Record<string, any>;
};

const identity = (user: User, op: Operation, resources: Resources) => {
	return op.value;
};

const lowerCase = (user: User, op: Operation, resources: Resources) => {
	return op.value.toLowerCase();
};

const givenName = (user: User, op: Operation, resources: Resources) => {
	const currentName =
		(resources.user.name as string | null | undefined) ?? user.name;
	const familyName = currentName?.split(" ").slice(1).join(" ").trim();
	const givenName = op.value;

	return getUserFullName({
		givenName,
		familyName,
	});
};

const familyName = (user: User, op: Operation, resources: Resources) => {
	const currentName =
		(resources.user.name as string | null | undefined) ?? user.name;
	const givenName = currentName
		? (currentName.split(" ").slice(0, -1).join(" ") || currentName).trim()
		: undefined;
	const familyName = op.value;
	return getUserFullName({
		givenName,
		familyName,
	});
};

const userPatchMappings: Record<string, Mapping> = {
	"/name/formatted": { resource: "user", target: "name", map: identity },
	"/name/givenName": { resource: "user", target: "name", map: givenName },
	"/name/familyName": {
		resource: "user",
		target: "name",
		map: familyName,
	},
	"/externalId": {
		resource: "account",
		target: "accountId",
		map: identity,
	},
	"/userName": { resource: "user", target: "email", map: lowerCase },
};

const normalizePath = (path: string): string => {
	const withoutLeadingSlash = path.startsWith("/") ? path.slice(1) : path;
	return `/${withoutLeadingSlash.replaceAll(".", "/")}`;
};

const isNestedObject = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const applyMapping = (
	user: User,
	resources: Resources,
	path: string,
	value: unknown,
	op: "add" | "replace",
) => {
	const normalizedPath = normalizePath(path);
	const mapping = userPatchMappings[normalizedPath];

	if (!mapping) {
		return;
	}

	const newValue = mapping.map(
		user,
		{
			op,
			value,
			path: normalizedPath,
		},
		resources,
	);

	if (op === "add" && mapping.resource === "user") {
		const currentValue = (user as Record<string, unknown>)[mapping.target];
		if (currentValue === newValue) {
			return;
		}
	}

	resources[mapping.resource][mapping.target] = newValue;
};

const applyPatchValue = (
	user: User,
	resources: Resources,
	value: unknown,
	op: "add" | "replace",
	path?: string | undefined,
) => {
	if (isNestedObject(value)) {
		for (const [key, nestedValue] of Object.entries(value)) {
			const nestedPath = path ? `${path}.${key}` : key;
			applyPatchValue(user, resources, nestedValue, op, nestedPath);
		}
	} else if (path) {
		applyMapping(user, resources, path, value, op);
	}
};

export const buildUserPatch = (user: User, operations: Operation[]) => {
	const userPatch: Record<string, any> = {};
	const accountPatch: Record<string, any> = {};
	const resources: Resources = { user: userPatch, account: accountPatch };

	for (const operation of operations) {
		if (operation.op !== "add" && operation.op !== "replace") {
			continue;
		}

		applyPatchValue(
			user,
			resources,
			operation.value,
			operation.op,
			operation.path,
		);
	}

	return resources;
};

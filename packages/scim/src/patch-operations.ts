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
	map: (user: User, op: Operation) => any;
};

const identity = (user: User, op: Operation) => {
	return op.value;
};

const lowerCase = (user: User, op: Operation) => {
	return op.value.toLowerCase();
};

const givenName = (user: User, op: Operation) => {
	const familyName = user.name.split(" ").slice(1).join(" ").trim();
	const givenName = op.value;

	return getUserFullName(user.email, {
		givenName,
		familyName,
	});
};

const familyName = (user: User, op: Operation) => {
	const givenName = (
		user.name.split(" ").slice(0, -1).join(" ") || user.name
	).trim();
	const familyName = op.value;
	return getUserFullName(user.email, {
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

export const buildUserPatch = (user: User, operations: Operation[]) => {
	const userPatch: Record<string, any> = {};
	const accountPatch: Record<string, any> = {};

	const resources = { user: userPatch, account: accountPatch };

	for (const operation of operations) {
		if (operation.op !== "replace" || !operation.path) {
			continue;
		}

		const mapping = userPatchMappings[operation.path];
		if (mapping) {
			const resource = resources[mapping.resource];
			resource[mapping.target] = mapping.map(user, operation);
		}
	}

	return resources;
};

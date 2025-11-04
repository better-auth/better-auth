import { type User } from "better-auth";
import { getUserFullName } from "./normalizers";

type Operation = {
	op: "add" | "remove" | "replace";
	value: any;
	path?: string;
};

type Normalizer = {
	target: string;
	resource: "user" | "account";
	normalize: (user: User, op: Operation) => any;
};

const identity = (user: User, op: Operation) => {
	return op.value;
};

const givenName = (user: User, op: Operation) => {
	const familyName = user.name.split(" ").slice(1).join(" ").trim();
	const givenName = op.value;

	return getUserFullName(user.email, {
		familyName,
		givenName,
	});
};

const familyName = (user: User, op: Operation) => {
	const givenName = (
		user.name.split(" ").slice(0, -1).join(" ") || user.name
	).trim();
	const familyName = op.value;
	return getUserFullName(user.email, {
		familyName,
		givenName,
	});
};

const userNormalizers: Record<string, Normalizer> = {
	"/name/formatted": { resource: "user", target: "name", normalize: identity },
	"/name/givenName": { resource: "user", target: "name", normalize: givenName },
	"/name/familyName": {
		resource: "user",
		target: "name",
		normalize: familyName,
	},
	"/externalId": {
		resource: "account",
		target: "accountId",
		normalize: identity,
	},
	"/userName": { resource: "user", target: "email", normalize: identity },
};

export const buildUserPatch = (user: User, operations: Operation[]) => {
	const userPatch: Record<string, any> = {};
	const accountPatch: Record<string, any> = {};

	const resources = { user: userPatch, account: accountPatch };

	for (const operation of operations) {
		if (operation.op !== "replace" || !operation.path) {
			continue;
		}

		const normalizer = userNormalizers[operation.path];
		if (normalizer) {
			const resource = resources[normalizer.resource];
			resource[normalizer.target] = normalizer.normalize(user, operation);
		}
	}

	return resources;
};

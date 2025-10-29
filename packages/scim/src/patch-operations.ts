import { type User } from "better-auth";
import { getUserFullName } from "./normalizers";

type Operation = {
	op: "add" | "remove" | "replace";
	value: any;
	path?: string;
};

type Normalizer = {
	target: string;
	normalize: (user: User, op: Operation) => any;
};

const identity = (user: User, op: Operation) => {
	return op.value;
};

const givenName = (user: User, op: Operation) => {
	const familyName = user.name.split(" ")[1];
	const givenName = op.value;

	return getUserFullName(user.email, {
		familyName,
		givenName,
	});
};

const familyName = (user: User, op: Operation) => {
	const givenName = user.name.split(" ")[0];
	const familyName = op.value;
	return getUserFullName(user.email, {
		familyName,
		givenName,
	});
};

const userNormalizers: Record<string, Normalizer> = {
	"name.formatted": { target: "name", normalize: identity },
	"name.givenName": { target: "name", normalize: givenName },
	"name.familyName": { target: "name", normalize: familyName },
	active: { target: "active", normalize: identity },
	userName: { target: "email", normalize: identity },
};

export const applyUserPatch = (user: User, op: Operation) => {
	const normalizer = userNormalizers[op.path ?? "unknown"];

	if (normalizer) {
		return { target: normalizer.target, value: normalizer.normalize(user, op) };
	}
};

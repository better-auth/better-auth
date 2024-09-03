import { clone } from "./clone";

const mergeObjects = (target: any, source: any): any => {
	for (const key in source) {
		if (!source.hasOwnProperty(key)) continue;

		if (key === "constructor" || key === "prototype" || key === "__proto__")
			continue;

		const value = source[key];

		if (isPrimitive(value)) {
			if (value !== undefined || !(key in target)) {
				target[key] = value;
			}
		} else if (!target[key] || isArray(value)) {
			target[key] = clone(value);
		} else {
			target[key] = mergeObjects(target[key], value);
		}
	}

	return target;
};

const isArray = (value: unknown): value is unknown[] => {
	return Array.isArray(value);
};

const isPrimitive = (
	value: unknown,
): value is bigint | symbol | string | number | boolean | null | undefined => {
	if (value === null) return true;

	const type = typeof value;

	return type !== "object" && type !== "function";
};

export const merge = (objects: object[]): object => {
	const target = clone(objects[0]);

	for (let i = 1, l = objects.length; i < l; i++) {
		mergeObjects(target, objects[i]);
	}

	return target;
};

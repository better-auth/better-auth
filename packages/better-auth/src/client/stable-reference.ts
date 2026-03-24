function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isDeepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}

	if (left instanceof Date && right instanceof Date) {
		return left.getTime() === right.getTime();
	}

	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) {
			return false;
		}

		for (let index = 0; index < left.length; index++) {
			if (!isDeepEqual(left[index], right[index])) {
				return false;
			}
		}

		return true;
	}

	if (isPlainObject(left) && isPlainObject(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);

		if (leftKeys.length !== rightKeys.length) {
			return false;
		}

		for (const key of leftKeys) {
			if (!(key in right)) {
				return false;
			}

			if (!isDeepEqual(left[key], right[key])) {
				return false;
			}
		}

		return true;
	}

	return false;
}

export function getStableReference<T>(current: T, next: T): T {
	return isDeepEqual(current, next) ? current : next;
}

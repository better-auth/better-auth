import { createRandomStringGenerator } from "@better-auth/utils/random";

export const generateId = (size?: number) => {
	return createRandomStringGenerator("a-z", "A-Z", "0-9")(size || 32);
};

export const randomUUIDv7 = (): string => {
	if (typeof Bun !== "undefined") {
		return Bun.randomUUIDv7();
	}
	const v4 = crypto.randomUUID().substring(15);
	const ts = Date.now().toString(16).padStart(12, "0");
	return `${ts.substring(0, 8)}-${ts.substring(8, 12)}-7${v4}`;
};

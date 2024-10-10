import { describe, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from ".";

describe("Admin plugin", async () => {
	const { client, auth } = await getTestInstance({
		plugins: [admin()],
	});
});

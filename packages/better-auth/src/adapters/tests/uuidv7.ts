import { expect } from "vitest";
import type { User } from "../../../../core/src/db/schema/user";
import { createTestSuite } from "../create-test-suite";
import { getNormalTestSuiteTests } from "./basic";

const randomUUIDv7 = (): string => {
	// 1. Generate 16 random bytes (128 bits)
	const value = new Uint8Array(16);
	crypto.getRandomValues(value);

	// 2. Get current timestamp in ms (48 bits)
	const timestamp = BigInt(Date.now());

	// 3. Inject timestamp into the first 6 bytes (Big-Endian)
	value[0] = Number((timestamp >> 40n) & 0xffn);
	value[1] = Number((timestamp >> 32n) & 0xffn);
	value[2] = Number((timestamp >> 24n) & 0xffn);
	value[3] = Number((timestamp >> 16n) & 0xffn);
	value[4] = Number((timestamp >> 8n) & 0xffn);
	value[5] = Number(timestamp & 0xffn);

	// 4. Set Version to 7 (0111) - index 6, high nibble
	value[6] = (value[6]! & 0x0f) | 0x70;

	// 5. Set Variant to 1 (10xx) - index 8, high nibble
	value[8] = (value[8]! & 0x3f) | 0x80;

	// 6. Convert to Hex String (00000000-0000-0000-0000-000000000000)
	return [...value]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
};

export const uuidv7TestSuite = createTestSuite(
	"uuidv7",
	{
		defaultBetterAuthOptions: {
			advanced: {
				database: {
					generateId: "uuidv7",
				},
			},
		},
		prefixTests: "uuidv7",
		alwaysMigrate: true,
		// This is here to overwrite `generateId` functions to generate UUIDv7s instead of the default.
		// Since existing tests often use generated IDs as well as `forceAllowId` to be true, this is needed to ensure the tests pass.
		customIdGenerator() {
			return randomUUIDv7();
		},
	},
	(helpers) => {
		const { "create - should use generateId if provided": _, ...normalTests } =
			getNormalTestSuiteTests(helpers);
		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(opts.advanced?.database?.generateId === "uuidv7").toBe(true);
			},
			"create - should return a uuidv7": async () => {
				const user = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: {
						...user,
						//@ts-expect-error - remove id from `user`
						id: undefined,
					},
				});
				expect(res).toHaveProperty("id");
				expect(typeof res.id).toBe("string");
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
				expect(res.id).toMatch(uuidRegex);
				console.log(res);
			},
			"findOne - should find a model using a uuidv7": async () => {
				const { id: _, ...user } = await helpers.generate("user");
				const res = await helpers.adapter.create<User>({
					model: "user",
					data: user,
				});

				const result = await helpers.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: res.id }],
				});
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
				expect(result?.id).toMatch(uuidRegex);
				expect(result).toEqual(res);
			},
			...normalTests,
		};
	},
);

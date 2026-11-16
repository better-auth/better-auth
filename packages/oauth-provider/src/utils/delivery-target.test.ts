import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeliveryTargetRejection } from "./delivery-target";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const PUBLIC = { address: "93.184.216.34", family: 4 };

beforeEach(() => {
	lookupMock.mockReset();
	lookupMock.mockResolvedValue([PUBLIC]);
});

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03#section-10.7
 */
describe("getDeliveryTargetRejection", () => {
	const reject = (uri: string, signal = AbortSignal.timeout(5_000)) =>
		getDeliveryTargetRejection(uri, signal);

	it("accepts a host that resolves only to public addresses", async () => {
		lookupMock.mockResolvedValue([
			PUBLIC,
			{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
		]);
		await expect(reject("https://client.example.com/hook")).resolves.toBeNull();
		expect(lookupMock).toHaveBeenCalledWith("client.example.com", {
			all: true,
			verbatim: true,
		});
	});

	it.each([
		["10.0.0.5", 4],
		["127.0.0.1", 4],
		["169.254.169.254", 4],
		["fd00::1", 6],
		["::ffff:127.0.0.1", 6],
	])("rejects a host that resolves to %s", async (address, family) => {
		lookupMock.mockResolvedValue([{ address, family }]);
		await expect(reject("https://client.example.com")).resolves.toBe(
			`resolves to a non-public address (${address})`,
		);
	});

	it("rejects a host when any resolved address is not public", async () => {
		lookupMock.mockResolvedValue([PUBLIC, { address: "10.0.0.5", family: 4 }]);
		await expect(reject("https://client.example.com")).resolves.toContain(
			"10.0.0.5",
		);
	});

	it("rejects a host that fails to resolve or resolves to nothing", async () => {
		lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
		await expect(reject("https://client.example.com")).resolves.toBe(
			"could not be resolved",
		);
		lookupMock.mockResolvedValueOnce([]);
		await expect(reject("https://client.example.com")).resolves.toBe(
			"could not be resolved",
		);
	});

	/**
	 * Some runtimes expose `node:dns/promises` but throw when `lookup` is
	 * called. That is a missing resolver, not a failed lookup, so only the host
	 * name check applies.
	 */
	it.each([
		[
			"the unenv stub message",
			new Error("[unenv] dns.lookup is not implemented yet!"),
		],
		[
			"an error code",
			Object.assign(new Error("unsupported"), {
				code: "ERR_METHOD_NOT_IMPLEMENTED",
			}),
		],
	])(
		"accepts the host name when the runtime's lookup throws %s",
		async (_, error) => {
			lookupMock.mockRejectedValue(error);
			await expect(reject("https://client.example.com")).resolves.toBeNull();
		},
	);

	it("rejects a host whose lookup fails with a DNS error", async () => {
		lookupMock.mockRejectedValue(
			Object.assign(new Error("queryA ENOTFOUND client.example.com"), {
				code: "ENOTFOUND",
			}),
		);
		await expect(reject("https://client.example.com")).resolves.toBe(
			"could not be resolved",
		);
	});

	it("rejects an unparsable URL and a private target without a lookup", async () => {
		await expect(reject("not a url")).resolves.toBe("is not a valid URL");
		await expect(reject("https://10.0.0.5/hook")).resolves.toBe(
			"points to a private or reserved address",
		);
		await expect(reject("https://[::1]/hook")).resolves.toBe(
			"points to a private or reserved address",
		);
		await expect(reject("https://localhost/hook")).resolves.toBe(
			"points to a private or reserved address",
		);
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it("accepts a public IP literal without a lookup", async () => {
		await expect(reject("https://93.184.216.34/hook")).resolves.toBeNull();
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it("rejects when the deadline passes before the lookup answers", async () => {
		lookupMock.mockReturnValue(new Promise(() => {}));
		await expect(
			reject("https://client.example.com", AbortSignal.timeout(20)),
		).resolves.toBe("could not be resolved");
	});

	it("rejects when the deadline already passed", async () => {
		lookupMock.mockReturnValue(new Promise(() => {}));
		await expect(
			reject("https://client.example.com", AbortSignal.abort()),
		).resolves.toBe("could not be resolved");
	});

	describe("with skipResolution", () => {
		const skip = (uri: string) =>
			getDeliveryTargetRejection(uri, AbortSignal.timeout(5_000), {
				skipResolution: true,
			});

		it("accepts a host name without a lookup, whatever it resolves to", async () => {
			lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
			await expect(skip("https://client.example.com/hook")).resolves.toBeNull();
			expect(lookupMock).not.toHaveBeenCalled();
		});

		it("still rejects a host the syntactic rule rejects", async () => {
			await expect(skip("https://10.0.0.5/hook")).resolves.toBe(
				"points to a private or reserved address",
			);
			await expect(skip("https://localhost/hook")).resolves.toBe(
				"points to a private or reserved address",
			);
			await expect(skip("not a url")).resolves.toBe("is not a valid URL");
			expect(lookupMock).not.toHaveBeenCalled();
		});
	});
});

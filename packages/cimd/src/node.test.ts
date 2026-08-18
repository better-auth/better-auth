import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	lookup: vi.fn(),
	request: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchClientMetadataResource } from "./node";

interface MockResponseOptions {
	body?: string;
	headers?: Record<string, string>;
	status?: number;
}

function mockHttpsResponse(options: MockResponseOptions = {}) {
	mocks.request.mockImplementation(
		(
			_url: URL,
			requestOptions: {
				lookup: (
					hostname: string,
					options: object,
					callback: (
						error: Error | null,
						address: string,
						family: number,
					) => void,
				) => void;
			},
			onResponse: (response: Readable) => void,
		) => {
			const request = new EventEmitter() as EventEmitter & {
				end: () => void;
				destroy: (error?: Error) => void;
			};
			request.end = () => {
				requestOptions.lookup("client.example.com", {}, (error) => {
					if (error) {
						request.emit("error", error);
						return;
					}
					const response = Readable.from([
						Buffer.from(options.body ?? "metadata"),
					]) as Readable & {
						headers: Record<string, string>;
						statusCode: number;
						statusMessage: string;
					};
					response.headers = options.headers ?? {
						"content-type": "application/json",
					};
					response.statusCode = options.status ?? 200;
					response.statusMessage = "OK";
					onResponse(response);
				});
			};
			request.destroy = (error) => {
				if (error) request.emit("error", error);
			};
			return request;
		},
	);
}

beforeEach(() => {
	mocks.lookup.mockReset();
	mocks.request.mockReset();
});

describe("Node CIMD metadata transport", () => {
	it("rejects private DNS answers before opening a connection", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		]);

		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json"),
		).rejects.toThrow("public");
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("resolves once, pins an approved address, and preserves Host and TLS SNI", async () => {
		mocks.lookup.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
		]);
		let pinnedAddress: string | undefined;
		mockHttpsResponse({ body: "ok" });
		mocks.request.mockImplementationOnce(
			(
				url: URL,
				options: {
					agent: boolean;
					headers: Record<string, string>;
					lookup: (
						hostname: string,
						options: object,
						callback: (
							error: Error | null,
							address: string,
							family: number,
						) => void,
					) => void;
					servername: string;
				},
				onResponse: (response: Readable) => void,
			) => {
				const request = new EventEmitter() as EventEmitter & {
					end: () => void;
					destroy: (error?: Error) => void;
				};
				request.end = () => {
					options.lookup(url.hostname, {}, (_error, address) => {
						pinnedAddress = address;
						const response = Readable.from([Buffer.from("ok")]) as Readable & {
							headers: Record<string, string>;
							statusCode: number;
							statusMessage: string;
						};
						response.headers = { "content-type": "text/plain" };
						response.statusCode = 200;
						response.statusMessage = "OK";
						onResponse(response);
					});
				};
				request.destroy = () => {};
				expect(options.servername).toBe("client.example.com");
				expect(options.agent).toBe(false);
				expect(options.headers.host).toBe("client.example.com");
				return request;
			},
		);

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(await response.text()).toBe("ok");
		expect(mocks.lookup).toHaveBeenCalledTimes(1);
		expect(mocks.lookup).toHaveBeenCalledWith("client.example.com", {
			all: true,
			verbatim: true,
		});
		expect(pinnedAddress).toBe("93.184.216.34");
	});

	it("returns redirect responses without following them", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse({
			status: 302,
			headers: { location: "https://other.example/client.json" },
		});

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://other.example/client.json",
		);
		expect(mocks.request).toHaveBeenCalledTimes(1);
	});

	it("returns a 304 response without constructing a forbidden body", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse({ status: 304, headers: { etag: '"current"' } });

		const response = await fetchClientMetadataResource(
			"https://client.example.com/client.json",
		);
		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
		expect(response.headers.get("etag")).toBe('"current"');
	});

	it("preserves supplied method, headers, and abort signal", async () => {
		mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
		mockHttpsResponse();
		const controller = new AbortController();

		await fetchClientMetadataResource(
			"https://client.example.com/client.json",
			{
				method: "HEAD",
				headers: { accept: "application/oauth-client-metadata+json" },
				signal: controller.signal,
			},
		);

		const options = mocks.request.mock.calls[0]?.[1] as {
			headers: Record<string, string>;
			method: string;
			signal: AbortSignal;
		};
		expect(options.method).toBe("HEAD");
		expect(options.headers.accept).toBe(
			"application/oauth-client-metadata+json",
		);
		expect(options.signal).toBe(controller.signal);
	});

	it("rejects unsupported methods instead of dropping their request body", async () => {
		await expect(
			fetchClientMetadataResource("https://client.example.com/client.json", {
				method: "POST",
				body: "must-not-be-dropped",
			}),
		).rejects.toThrow("GET and HEAD");
		expect(mocks.lookup).not.toHaveBeenCalled();
		expect(mocks.request).not.toHaveBeenCalled();
	});

	it("does not send SNI for an IP-literal URL", async () => {
		mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
		mockHttpsResponse();

		await fetchClientMetadataResource("https://8.8.8.8/client.json");
		const options = mocks.request.mock.calls[0]?.[1] as {
			servername?: string;
		};
		expect(options.servername).toBeUndefined();
	});
});

import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { getClientConfig } from "./config";

describe("client config", () => {
	it("enable default plugins should include user agent", async ({
		onTestFinished,
	}) => {
		const server = createServer((_, res) => res.end());
		await new Promise<void>((resolve) =>
			server.listen(0, () => {
				resolve();
			}),
		);
		onTestFinished(() => {
			server.close();
		});
		const url = `http://localhost:${(server.address() as any).port}`;
		const { $fetch } = getClientConfig({
			baseURL: "http://localhost:3000",
		});
		await $fetch(url, {
			onResponse: ({ request }) => {
				expect(request.headers.has("User-Agent")).toBe(true);
			},
		});
	});

	it("disable default plugins should not include user agent", async ({
		onTestFinished,
	}) => {
		const server = createServer((_, res) => res.end());
		await new Promise<void>((resolve) =>
			server.listen(0, () => {
				resolve();
			}),
		);
		onTestFinished(() => {
			server.close();
		});
		const url = `http://localhost:${(server.address() as any).port}`;
		const { $fetch } = getClientConfig({
			disableDefaultFetchPlugins: true,
			baseURL: "http://localhost:3000",
		});
		await $fetch(url, {
			onResponse: ({ request }) => {
				expect(request.headers.has("User-Agent")).toBe(false);
			},
		});
	});
});

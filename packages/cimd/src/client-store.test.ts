import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClientMetadataDocument } from "./client-store";

const CLIENT_ID_URL =
	"https://hanging-body-client.example.com/client-metadata.json";

describe("fetchClientMetadataDocument", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("applies the fetch deadline while consuming the response body", async () => {
		vi.useFakeTimers();
		const fetchResult = fetchClientMetadataDocument(
			{} as unknown as GenericEndpointContext,
			CLIENT_ID_URL,
			{
				fetchClientMetadataResource: async () =>
					new Response(new ReadableStream<Uint8Array>(), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			},
		).then(
			() => null,
			(error: unknown) => error,
		);

		await vi.advanceTimersByTimeAsync(5_000);
		const stillPending = Symbol("still-pending");
		const outcome = await Promise.race([
			fetchResult,
			Promise.resolve(stillPending),
		]);

		expect(outcome).toBeInstanceOf(APIError);
		if (!(outcome instanceof APIError)) {
			throw new Error("expected metadata fetch to fail with APIError");
		}
		expect(outcome).toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description: "Metadata document fetch timed out after 5000ms",
			},
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("maps response stream failures to invalid_client", async () => {
		vi.useFakeTimers();
		const result = fetchClientMetadataDocument(
			{} as unknown as GenericEndpointContext,
			CLIENT_ID_URL,
			{
				fetchClientMetadataResource: async () =>
					new Response(
						new ReadableStream<Uint8Array>({
							start(controller) {
								controller.error(new Error("response stream failed"));
							},
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					),
			},
		);

		await expect(result).rejects.toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description:
					"Failed to fetch metadata document (network error or redirect blocked)",
			},
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11328
	 */
	it("fetches through a transport without redirect: error", async () => {
		const result = fetchClientMetadataDocument(
			{} as unknown as GenericEndpointContext,
			CLIENT_ID_URL,
			{
				// Cloudflare Workers only accepts "follow" and "manual".
				fetchClientMetadataResource: async (_input, init) => {
					if (init?.redirect === "error") {
						throw new TypeError("Invalid redirect value");
					}
					return Response.json({
						client_id: CLIENT_ID_URL,
						redirect_uris: ["https://hanging-body-client.example.com/callback"],
					});
				},
			},
		);

		await expect(result).resolves.toMatchObject({ status: "modified" });
	});

	it("preserves the metadata size-limit APIError", async () => {
		vi.useFakeTimers();
		const result = fetchClientMetadataDocument(
			{} as unknown as GenericEndpointContext,
			CLIENT_ID_URL,
			{
				fetchClientMetadataResource: async () =>
					new Response("x".repeat(5 * 1024 + 1), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
			},
		);

		await expect(result).rejects.toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description: "Metadata document exceeds 5KB size limit",
			},
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("maps response cancellation failures to invalid_client", async () => {
		vi.useFakeTimers();
		const result = fetchClientMetadataDocument(
			{} as unknown as GenericEndpointContext,
			CLIENT_ID_URL,
			{
				fetchClientMetadataResource: async () =>
					new Response(
						new ReadableStream<Uint8Array>({
							cancel() {
								throw new Error("response cancellation failed");
							},
						}),
						{
							status: 200,
							headers: {
								"content-length": String(5 * 1024 + 1),
								"content-type": "application/json",
							},
						},
					),
			},
		);

		await expect(result).rejects.toMatchObject({
			statusCode: 400,
			body: {
				error: "invalid_client",
				error_description:
					"Failed to fetch metadata document (network error or redirect blocked)",
			},
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});

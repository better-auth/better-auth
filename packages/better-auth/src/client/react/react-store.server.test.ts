import { createFetch } from "@better-fetch/fetch";
import { atom, onMount } from "nanostores";
import { createElement, Suspense } from "react";
import * as ReactDOM from "react-dom";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { kAuthQueryResource, useAuthQuery } from "../query";
import { getSessionAtom } from "../session-atom";
import { useAuthStore } from "./react-store";

/**
 * @see https://react.dev/reference/react-dom/browser
 */
describe("React auth queries during server rendering", () => {
	it.each([
		"session",
		"plugin",
	])("renders the fallback without reading or fetching the %s query", async (kind) => {
		const fetch = vi.fn(async () => new Response("null"));
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: fetch,
		});
		const store =
			kind === "session"
				? getSessionAtom($fetch).session
				: useAuthQuery(atom(false), "/plugin", $fetch);
		const getPromise = vi.spyOn(store[kAuthQueryResource], "getPromise");
		const mount = vi.fn();
		onMount(store, mount);
		const onError = vi.fn();
		const onBrowserBailout = vi.fn();
		const options = { onError, onBrowserBailout };

		function Query() {
			useAuthStore(store);
			return createElement("p", null, "unresolved query rendered");
		}

		const stream = await renderToReadableStream(
			createElement(
				Suspense,
				{ fallback: createElement("p", null, "loading") },
				createElement(Query),
			),
			options,
		);
		await stream.allReady;
		const html = await new Response(stream).text();
		expect(html).toContain("<p>loading</p>");
		expect(html).not.toContain("unresolved query rendered");
		expect(getPromise).not.toHaveBeenCalled();
		expect(mount).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		if ("browser" in ReactDOM) {
			expect(onBrowserBailout).toHaveBeenCalledOnce();
			expect(onError).not.toHaveBeenCalled();
		} else {
			expect(onError).toHaveBeenCalledOnce();
		}
	});

	it("keeps ordinary plugin atoms server-renderable", async () => {
		const store = atom("plugin value");
		function Value() {
			return createElement("p", null, useAuthStore(store));
		}
		const stream = await renderToReadableStream(createElement(Value));
		expect(await new Response(stream).text()).toBe("<p>plugin value</p>");
	});
});

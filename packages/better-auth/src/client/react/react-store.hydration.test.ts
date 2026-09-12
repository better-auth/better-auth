// @vitest-environment happy-dom

import { createFetch } from "@better-fetch/fetch";
import { atom, cleanStores } from "nanostores";
import { act, createElement, Suspense } from "react";
import * as ReactDOM from "react-dom";
import type { Root } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kAuthQueryResource, useAuthQuery } from "../query";
import { getSessionAtom } from "../session-atom";
import { useAuthStore } from "./react-store";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * @see https://react.dev/reference/react-dom/browser
 */
describe("React auth query hydration", () => {
	let root: Root | undefined;
	afterEach(async () => {
		await act(async () => root?.unmount());
		root = undefined;
		vi.unstubAllGlobals();
		document.body.innerHTML = "";
		vi.useRealTimers();
	});

	it("does not restart a failed Suspense request when the initial mount timer runs", async () => {
		vi.useFakeTimers();
		const fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ message: "Server error" }), {
					status: 500,
				}),
		);
		const { session } = getSessionAtom(
			createFetch({
				baseURL: "http://localhost:3000",
				customFetchImpl: fetch,
			}),
		);
		const unlisten = session.listen(() => {});
		await session[kAuthQueryResource].getPromise();
		expect(session.value.error?.status).toBe(500);
		await vi.runOnlyPendingTimersAsync();
		expect(fetch).toHaveBeenCalledOnce();
		expect(session.value.error?.status).toBe(500);
		unlisten();
		cleanStores(session);
		const unlistenRemount = session.listen(() => {});
		await vi.runOnlyPendingTimersAsync();
		expect(fetch).toHaveBeenCalledTimes(2);
		unlistenRemount();
		cleanStores(session);
	});

	it.each([
		"session",
		"plugin",
	])("hydrates the %s fallback and fetches only in the browser", async (kind) => {
		let resolveRequest: ((response: Response) => void) | undefined;
		const fetch = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveRequest = resolve;
				}),
		);
		const $fetch = createFetch({
			baseURL: "http://localhost:3000",
			customFetchImpl: fetch,
		});
		const store =
			kind === "session"
				? getSessionAtom($fetch).session
				: useAuthQuery(atom(false), "/plugin", $fetch);
		function Query() {
			const result = useAuthStore(store);
			return createElement(
				"p",
				null,
				result.data === null ? "signed out" : "ready",
			);
		}
		const app = createElement(
			Suspense,
			{ fallback: createElement("p", null, "loading") },
			createElement(Query),
		);
		const onRecoverableError = vi.fn();
		let html: string;
		// Canary detects the server renderer even with a DOM available.
		// Stable React's compatibility path uses the server's lack of window.
		if (!("browser" in ReactDOM)) vi.stubGlobal("window", undefined);
		try {
			const stream = await renderToReadableStream(app, { onError: () => {} });
			await stream.allReady;
			html = await new Response(stream).text();
		} finally {
			vi.unstubAllGlobals();
		}
		expect(fetch).not.toHaveBeenCalled();
		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		expect(container.textContent).toBe("loading");
		await act(async () => {
			root = hydrateRoot(container, app, { onRecoverableError });
		});
		expect(container.textContent).toBe("loading");
		expect(fetch).toHaveBeenCalledOnce();
		await act(async () => {
			resolveRequest?.(new Response("null"));
		});
		await vi.waitFor(() => expect(container.textContent).toBe("signed out"));
		expect(fetch).toHaveBeenCalledOnce();
		if ("browser" in ReactDOM) {
			expect(onRecoverableError).not.toHaveBeenCalled();
		} else {
			expect(onRecoverableError).toHaveBeenCalledOnce();
		}
		await act(async () => root?.unmount());
		root = undefined;
		cleanStores(store);
	});
});

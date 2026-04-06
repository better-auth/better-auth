// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
	resolveDeploymentIdForSkewProtection,
	vercelSkewProtectionPlugin,
} from "./fetch-plugins";

afterEach(() => {
	document.documentElement.removeAttribute("data-dpl-id");
});

describe("resolveDeploymentIdForSkewProtection", () => {
	it("prefers globalThis.NEXT_DEPLOYMENT_ID", () => {
		const prev = (globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID;
		(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID =
			"dpl_from_global";
		try {
			expect(resolveDeploymentIdForSkewProtection()).toBe("dpl_from_global");
		} finally {
			if (prev === undefined) {
				(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID = undefined;
			} else {
				(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID = prev;
			}
		}
	});

	it("reads data-dpl-id from the document when global is unset", () => {
		document.documentElement.setAttribute("data-dpl-id", "dpl_from_html");
		expect(resolveDeploymentIdForSkewProtection()).toBe("dpl_from_html");
	});
});

describe("vercelSkewProtectionPlugin", () => {
	it("sets x-deployment-id from resolved deployment id", () => {
		document.documentElement.setAttribute("data-dpl-id", "dpl_test_123");
		const headers = new Headers();
		const ctx = {
			url: "/api/auth/get-session",
			headers,
			body: undefined,
			method: "GET",
			signal: new AbortController().signal,
		};
		vercelSkewProtectionPlugin.hooks?.onRequest?.(ctx as any);
		expect(headers.get("x-deployment-id")).toBe("dpl_test_123");
	});

	it("does not override an existing x-deployment-id header", () => {
		document.documentElement.setAttribute("data-dpl-id", "dpl_from_html");
		const headers = new Headers({ "x-deployment-id": "user_provided" });
		const ctx = {
			url: "/api/auth/get-session",
			headers,
			body: undefined,
			method: "GET",
			signal: new AbortController().signal,
		};
		vercelSkewProtectionPlugin.hooks?.onRequest?.(ctx as any);
		expect(headers.get("x-deployment-id")).toBe("user_provided");
	});

	it("does not set x-deployment-id when skew protection is disabled", () => {
		const prev = process.env.VERCEL_SKEW_PROTECTION_ENABLED;
		process.env.VERCEL_SKEW_PROTECTION_ENABLED = "0";
		try {
			document.documentElement.setAttribute("data-dpl-id", "dpl_test_123");
			const headers = new Headers();
			const ctx = {
				url: "/api/auth/get-session",
				headers,
				body: undefined,
				method: "GET",
				signal: new AbortController().signal,
			};
			vercelSkewProtectionPlugin.hooks?.onRequest?.(ctx as any);
			expect(headers.get("x-deployment-id")).toBe(null);
		} finally {
			if (prev === undefined) {
				Reflect.deleteProperty(process.env, "VERCEL_SKEW_PROTECTION_ENABLED");
			} else {
				process.env.VERCEL_SKEW_PROTECTION_ENABLED = prev;
			}
		}
	});

	it("uses VERCEL_DEPLOYMENT_ID when browser deployment id is unavailable", () => {
		const prevSkew = process.env.VERCEL_SKEW_PROTECTION_ENABLED;
		const prevDeployment = process.env.VERCEL_DEPLOYMENT_ID;
		const prevNextDeployment = process.env.NEXT_DEPLOYMENT_ID;
		const prevGlobal = (globalThis as Record<string, unknown>)
			.NEXT_DEPLOYMENT_ID;
		process.env.VERCEL_SKEW_PROTECTION_ENABLED = "1";
		process.env.VERCEL_DEPLOYMENT_ID = "dpl_from_vercel_env";
		process.env.NEXT_DEPLOYMENT_ID = undefined;
		(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID = undefined;
		document.documentElement.removeAttribute("data-dpl-id");
		try {
			const headers = new Headers();
			const ctx = {
				url: "/api/auth/get-session",
				headers,
				body: undefined,
				method: "GET",
				signal: new AbortController().signal,
			};
			vercelSkewProtectionPlugin.hooks?.onRequest?.(ctx as any);
			expect(headers.get("x-deployment-id")).toBe("dpl_from_vercel_env");
		} finally {
			if (prevSkew === undefined) {
				Reflect.deleteProperty(process.env, "VERCEL_SKEW_PROTECTION_ENABLED");
			} else {
				process.env.VERCEL_SKEW_PROTECTION_ENABLED = prevSkew;
			}
			if (prevDeployment === undefined) {
				Reflect.deleteProperty(process.env, "VERCEL_DEPLOYMENT_ID");
			} else {
				process.env.VERCEL_DEPLOYMENT_ID = prevDeployment;
			}
			if (prevNextDeployment === undefined) {
				Reflect.deleteProperty(process.env, "NEXT_DEPLOYMENT_ID");
			} else {
				process.env.NEXT_DEPLOYMENT_ID = prevNextDeployment;
			}
			if (prevGlobal === undefined) {
				(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID = undefined;
			} else {
				(globalThis as Record<string, unknown>).NEXT_DEPLOYMENT_ID = prevGlobal;
			}
		}
	});
});

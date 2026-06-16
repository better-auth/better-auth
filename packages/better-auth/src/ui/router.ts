import type {
	AuthContext,
	BetterAuthOptions,
	UIContext,
	UIExtension,
	UIMiddleware,
	UIPage,
	UIPluginCapability,
} from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { logger } from "@better-auth/core/env";
import type { Endpoint } from "better-call";
import { createRouter } from "better-call";
import { isAPIError } from "../utils/is-api-error";
import { renderDocument } from "./render";
import { uiRuntime } from "./runtime.generated";
import { getTheme, getUIBasePath, getUIRuntimePath } from "./utils";

type UIPageEntry = {
	pluginId: string;
	key: string;
	page: UIPage;
	path: string;
};

function normalizePagePath(path: string) {
	const prefixed = path.startsWith("/") ? path : `/${path}`;
	const trimmed = prefixed.replace(/\/+$/, "");
	return trimmed || "/";
}

function matchesUIPath(pattern: string, path: string) {
	const normalizedPattern = normalizePagePath(pattern);
	const normalizedPath = normalizePagePath(path);
	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}
	return normalizedPattern === normalizedPath;
}

function collectSlots(options: BetterAuthOptions) {
	const slots = new Map<string, UIExtension[]>();
	for (const plugin of options.plugins ?? []) {
		for (const [slot, extensions] of Object.entries(plugin.ui?.slots ?? {})) {
			const existing = slots.get(slot) ?? [];
			existing.push(...extensions);
			existing.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
			slots.set(slot, existing);
		}
	}
	return slots;
}

function collectCapabilities(options: BetterAuthOptions) {
	const capabilities = new Map<string, UIPluginCapability>();
	for (const plugin of options.plugins ?? []) {
		for (const [key, capability] of Object.entries(
			plugin.ui?.capabilities ?? {},
		)) {
			capabilities.set(key, {
				...capability,
				id: capability.id || key,
				enabled: capability.enabled ?? true,
			});
		}
	}
	return capabilities;
}

export function getUIPages(options: BetterAuthOptions) {
	const pages: UIPageEntry[] = [];
	const paths = new Map<string, UIPageEntry>();
	for (const plugin of options.plugins ?? []) {
		for (const [key, page] of Object.entries(plugin.ui?.pages ?? {})) {
			const path = normalizePagePath(page.path);
			const entry = {
				pluginId: plugin.id,
				key,
				page,
				path,
			};
			const existing = paths.get(path);
			if (existing) {
				logger.error(
					`UI page path conflict detected: "${path}" is registered by "${existing.pluginId}.${existing.key}" and "${plugin.id}.${key}".`,
				);
				continue;
			}
			paths.set(path, entry);
			pages.push(entry);
		}
	}
	return pages;
}

function getUIMiddleware(options: BetterAuthOptions, path: string) {
	const middleware: UIMiddleware[] = [];
	for (const plugin of options.plugins ?? []) {
		for (const item of plugin.ui?.middleware ?? []) {
			if (matchesUIPath(item.path, path)) {
				middleware.push(item.middleware);
			}
		}
	}
	return middleware;
}

function createUIContext(options: {
	ctx: AuthContext;
	request: Request;
	path: string;
	params: Record<string, string>;
	slots: Map<string, UIExtension[]>;
	capabilities: Map<string, UIPluginCapability>;
}): UIContext {
	const url = new URL(options.request.url);
	return {
		context: options.ctx,
		request: options.request,
		path: options.path,
		params: options.params,
		query: url.searchParams,
		theme: getTheme(options.ctx.options),
		slots(slot) {
			return options.slots.get(slot) ?? [];
		},
		capability(id) {
			const capability = options.capabilities.get(id);
			if (!capability || capability.enabled === false) return null;
			return capability as never;
		},
		hasCapability(id) {
			const capability = options.capabilities.get(id);
			return Boolean(capability && capability.enabled !== false);
		},
		plugins: {
			has(id) {
				return options.ctx.hasPlugin(id);
			},
		},
	};
}

function createPageEndpoint(
	entry: UIPageEntry,
	slots: Map<string, UIExtension[]>,
	capabilities: Map<string, UIPluginCapability>,
) {
	return createAuthEndpoint(
		entry.path,
		{
			method: "GET",
			requireRequest: true,
			metadata: {
				openapi: {
					description: `Render the ${entry.page.title} UI page`,
					responses: {
						"200": {
							description: "HTML page",
							content: {
								"text/html": {
									schema: { type: "string" },
								},
							},
						},
					},
				},
			},
		},
		async (c) => {
			const request = c.request ?? new Request(c.context.baseURL);
			const params =
				"params" in c && typeof c.params === "object" && c.params
					? (c.params as Record<string, string>)
					: {};
			const uiContext = createUIContext({
				ctx: c.context,
				request,
				path: entry.path,
				params,
				slots,
				capabilities,
			});
			const middleware = [
				...getUIMiddleware(c.context.options, entry.path),
				...(entry.page.middleware ?? []),
			];
			for (const item of middleware) {
				const response = await item(uiContext);
				if (response) return response;
			}
			const component = await entry.page.render(uiContext);
			return new Response(
				renderDocument({
					component,
					title: entry.page.title,
					theme: uiContext.theme,
					runtimePath: getUIRuntimePath(c.context.options),
					apiBaseURL: c.context.baseURL,
					uiBasePath: getUIBasePath(c.context.options),
					background: c.context.options.ui?.background,
				}),
				{
					headers: {
						"Content-Type": "text/html; charset=utf-8",
					},
				},
			);
		},
	);
}

const runtimeEndpoint = createAuthEndpoint(
	"/_ba/runtime.js",
	{
		method: "GET",
	},
	async () =>
		new Response(uiRuntime, {
			headers: {
				"Content-Type": "text/javascript; charset=utf-8",
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		}),
);

const actionEndpoint = createAuthEndpoint(
	"/_ba/action/:actionId",
	{
		method: "POST",
		requireRequest: true,
	},
	async () =>
		new Response(JSON.stringify([{ type: "reload" }]), {
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
		}),
);

export function uiRouter(ctx: AuthContext, options: BetterAuthOptions) {
	const slots = collectSlots(options);
	const capabilities = collectCapabilities(options);
	const pageEndpoints = getUIPages(options).reduce<Record<string, Endpoint>>(
		(acc, entry) => {
			acc[`ui_${entry.pluginId}_${entry.key}`] = createPageEndpoint(
				entry,
				slots,
				capabilities,
			);
			return acc;
		},
		{},
	);
	const endpoints = {
		...pageEndpoints,
		uiRuntime: runtimeEndpoint,
		uiAction: actionEndpoint,
	};
	return createRouter(endpoints, {
		routerContext: ctx,
		openapi: {
			disabled: true,
		},
		basePath: getUIBasePath(options),
		allowedMediaTypes: [
			"application/json",
			"application/x-www-form-urlencoded",
			"multipart/form-data",
			"text/plain",
		],
		skipTrailingSlashes: options.advanced?.skipTrailingSlashes ?? false,
		onError(e) {
			if (isAPIError(e) && e.status === "FOUND") {
				return;
			}
			if (options.onAPIError?.throw) {
				throw e;
			}
			if (options.onAPIError?.onError) {
				options.onAPIError.onError(e, ctx);
				return;
			}
			ctx.logger?.error(
				e && typeof e === "object" && "name" in e ? String(e.name) : "UIError",
				e,
			);
		},
	});
}

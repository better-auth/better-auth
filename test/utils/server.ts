import { toHonoHandler } from "./../../src/integrations/hono";
import {
	appendCorsHeaders,
	createApp,
	createRouter,
	defineEventHandler,
	eventHandler,
	toNodeListener,
} from "h3";
import { toH3Handler } from "../../src/integrations/h3";
import type { BetterAuthHandler } from "../../src";
import { listen, type Listener } from "listhen";
import { afterAll, beforeAll } from "vitest";
import { Hono } from "hono";

export const getH3Server = async (handler: BetterAuthHandler, port: number) => {
	let listener: Listener;
	beforeAll(async () => {
		const router = createRouter();
		router.add(
			"/api/auth/*",
			defineEventHandler(async (event) => {
				appendCorsHeaders(event, {
					origin: "*",
				});
				return toH3Handler(event, handler);
			}),
		);
		const app = createApp().use(router);
		listener = await listen(toNodeListener(app), {
			port: port || 4000,
		});
	});

	afterAll(async () => {
		await listener.close();
	});
};

export const getHonoServer = async (handler: BetterAuthHandler) => {
	const app = new Hono();
	beforeAll(() => {
		app.on(["POST", "GET"], "/api/auth/*", async (ctx) => {
			return toHonoHandler(handler, ctx.req);
		});
	});
	return app;
};

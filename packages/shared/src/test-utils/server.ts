import {
	appendCorsHeaders,
	createApp,
	createRouter,
	defineEventHandler,
	toNodeListener,
} from "h3";
import { Hono } from "hono";
import { type Listener, listen } from "listhen";
import { afterAll, beforeAll } from "vitest";
import type { BetterAuth } from "./server";
import { toH3Handler } from "../integrations/h3";
import { toHonoHandler } from "../integrations/hono";

export const getH3Server = async (
	handler: BetterAuth["handler"],
	port: number,
) => {
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

export const getHonoServer = async (handler: BetterAuth["handler"]) => {
	const app = new Hono();
	beforeAll(() => {
		app.on(["POST", "GET"], "/api/auth/*", async (ctx) => {
			return toHonoHandler(handler, ctx.req);
		});
	});
	return app;
};

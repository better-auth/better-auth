import type { BetterAuthHandler } from "better-auth";
import {
	appendCorsHeaders,
	createApp,
	createRouter,
	defineEventHandler,
	toNodeListener,
} from "h3";
import { type Listener, listen } from "listhen";
import { afterAll, beforeAll } from "vitest";
import { toH3Handler } from "better-auth/h3";

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

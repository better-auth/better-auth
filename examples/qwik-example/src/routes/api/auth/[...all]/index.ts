import type { RequestHandler } from "@builder.io/qwik-city";
import { auth } from "~/auth";

export const onRequest: RequestHandler = async (event) => {
	const response = await auth.handler(event.request);
	event.send(response);
};

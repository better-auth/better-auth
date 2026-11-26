import { getRequestEvent } from "@solidjs/web";
import { auth } from "./auth";

export async function getServerSession() {
	"use server";
	const event = getRequestEvent();
	if (!event) {
		return null;
	}
	return auth.api.getSession({ headers: event.request.headers });
}

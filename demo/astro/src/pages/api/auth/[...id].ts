import type { APIRoute } from "astro";
import { auth } from "../../../lib/auth";

export const ALL: APIRoute = ({ request }) => {
	return auth.handler(request);
};

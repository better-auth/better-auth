import { implEndpoint } from "../../better-call/server";
import { okDef } from "./shared";

export const ok = () =>
	implEndpoint(okDef, async (ctx) => {
		return ctx.json({
			ok: true,
		});
	});

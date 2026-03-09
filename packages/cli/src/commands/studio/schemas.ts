import * as z from "zod";

const tunnelSchema = z.object({
	id: z.string(),
	url: z.string(),
});

const tunnelReadySchema = z.object({
	type: z.literal("ready"),
	...tunnelSchema.shape,
});

const tunnelRequestSchema = z.object({
	type: z.literal("request"),
	id: z.number(),
	method: z.string(),
	path: z.string(),
	query: z.string(),
	headers: z.tuple([z.string(), z.string()]).array(),
	body: z.string().nullable(),
});

const tunnelResponseSchema = z.object({
	type: z.literal("response"),
	id: z.number(),
	status: z.number(),
	path: z.string(),
	headers: z.tuple([z.string(), z.string()]).array(),
	body: z.string().nullable(),
});

const tunnelEventSchema = z.discriminatedUnion("type", [
	tunnelReadySchema,
	tunnelRequestSchema,
	tunnelResponseSchema,
]);
type TunnelEventType = z.infer<typeof tunnelEventSchema>["type"];
export type TunnelEvent<T extends TunnelEventType = TunnelEventType> = z.infer<
	typeof tunnelEventSchema
> & { type: T };

export function isTunnelEvent<T extends TunnelEventType>(
	event: unknown,
	type?: T | undefined,
): event is TunnelEvent<T> {
	const result = tunnelEventSchema.safeParse(event);
	if (!result.success) return false;
	if (!type) return true;
	return result.data.type === type;
}

import type { BetterAuthClientOptions } from "@better-auth/core";
import type { SolidAuthClient } from "./client";
import { createSolidAuthClient } from "./client";
import { useStore } from "./solid-store";

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
export type { SolidAuthClient } from "./client";

/** Creates a Better Auth client for Solid 1. */
export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option,
): SolidAuthClient<Option> {
	return createSolidAuthClient(options, useStore);
}

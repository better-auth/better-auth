import { UnionToIntersection } from "../types/helper";
import { BetterAuth } from "../auth";
import { CustomProvider } from "../providers";
import { BetterFetchOption } from "@better-fetch/fetch";
import type { useAuthStore as reactStore } from "./react";
import type { useAuthStore as vueStore } from "./vue";

export type ProviderEndpoint<Auth extends BetterAuth> = UnionToIntersection<
	Auth["options"]["providers"] extends Array<infer T>
		? T extends CustomProvider
			? T["endpoints"]
			: {}
		: {}
>;

export type AuthStore = typeof reactStore | typeof vueStore;
export interface ClientOptions extends BetterFetchOption {}

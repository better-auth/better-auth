import type { UseFetchOptions } from "nuxt/app";
import type { authClient } from "../../lib/auth-client";

type SessionFetch = Parameters<typeof authClient.useSession>[0];
type SessionFetchOptions = Parameters<SessionFetch>[1];

type NuxtCompatibleOptions<Options extends UseFetchOptions<unknown>> = Options;
type NuxtCompatibleFetch<Fetch extends SessionFetch> = Fetch;

export type SessionFetchOptionsContract =
	NuxtCompatibleOptions<SessionFetchOptions>;
export type NuxtUseFetchContract = NuxtCompatibleFetch<typeof useFetch>;

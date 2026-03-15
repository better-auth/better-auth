import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	ClientStore,
} from "@better-auth/core";
import type {
	BetterFetch,
	BetterFetchOption,
	FetchEsque,
} from "@better-fetch/fetch";
import type {
	AcceptSignatureSignOptions,
	EthHttpSigner,
	ReplayMode,
	ServerConfig,
	SignerClient,
	SignerClientOptions,
} from "@slicekit/erc8128";
import {
	createSignerClient,
	formatKeyId,
	normalizeAcceptSignatureSignOptions,
	parseAcceptSignatureHeader,
	resolvePosture,
	selectAcceptSignatureRetryOptions,
} from "@slicekit/erc8128";
import type { erc8128 } from ".";
import type { Erc8128SignatureStore } from "./client-utils";
import {
	arraysEqual,
	buildFullUrl,
	resolveRequestBody,
	resolveSignatureStore,
	signRequestWithCache,
} from "./client-utils";
import { getRoutePolicyPathname } from "./route-policy";

export type { CachedSignature, Erc8128SignatureStore } from "./client-utils";

type PluginManagedOptions = "serverConfigs" | "fetch";

export interface Erc8128ClientOptions
	extends Omit<SignerClientOptions, PluginManagedOptions> {
	signer?: EthHttpSigner | (() => EthHttpSigner | null | undefined);
	storagePrefix?: string;
	expiryMarginSec?: number;
	storage?: "localStorage" | Erc8128SignatureStore | false;
}

const SKIP_PATHS = ["/.well-known/erc8128"];
const DEFAULT_EXPIRY_MARGIN_SEC = 10;
const MAX_ACCEPT_SIGNATURE_RETRIES = 1;

type RequestInitWithDuplex = RequestInit & {
	duplex?: "half" | "full";
};

export const erc8128Client = (options?: Erc8128ClientOptions) => {
	if (!options?.signer) {
		return {
			id: "erc8128",
			$InferServerPlugin: {} as ReturnType<typeof erc8128>,
		} satisfies BetterAuthClientPlugin;
	}

	const clientOptions = options;

	const {
		signer: _signer,
		storagePrefix: _storagePrefix,
		expiryMarginSec,
		storage: _storage,
		preferReplayable = false,
		...forwardedSignOptions
	} = options;

	const store = resolveSignatureStore(clientOptions);
	const margin = expiryMarginSec ?? DEFAULT_EXPIRY_MARGIN_SEC;
	const replay: ReplayMode = preferReplayable ? "replayable" : "non-replayable";

	let serverConfig: ServerConfig | null = null;
	let signerClient: SignerClient | null = null;
	let signerKey = "";

	function resolveSigner(): EthHttpSigner | null {
		if (typeof clientOptions.signer === "function") {
			return clientOptions.signer() ?? null;
		}
		return clientOptions.signer ?? null;
	}

	function getClient(signer: EthHttpSigner): SignerClient {
		const key = `${signer.chainId}:${signer.address.toLowerCase()}`;
		if (signerClient && signerKey === key) return signerClient;
		signerClient = createSignerClient(signer, {
			preferReplayable,
			...forwardedSignOptions,
		});
		signerKey = key;
		return signerClient;
	}

	function getKeyId(signer: EthHttpSigner): string {
		return formatKeyId(signer.chainId, signer.address);
	}

	function computeInitialSignOptions(
		request: Request,
		authBaseURL?: string,
	): AcceptSignatureSignOptions {
		const posture = resolvePosture(
			request.method,
			getRoutePolicyPathname(request, authBaseURL),
			serverConfig,
			{ ...forwardedSignOptions, replay },
		);

		return normalizeAcceptSignatureSignOptions({
			binding: posture.binding,
			replay: posture.replay,
			components: posture.components,
		});
	}

	return {
		id: "erc8128",
		$InferServerPlugin: {} as ReturnType<typeof erc8128>,
		getActions: (
			$fetch: BetterFetch,
			_$store: ClientStore,
			_clientOptions: BetterAuthClientOptions | undefined,
		) => {
			$fetch("/.well-known/erc8128", { method: "GET" })
				.then((result) => {
					const response = result as { data?: Record<string, unknown> | null };
					const payload = response.data;
					if (payload && typeof payload.max_validity_sec === "number") {
						serverConfig = payload as ServerConfig;
					}
				})
				.catch(() => {});

			return {
				clearSignatureCache: async () => {
					const signer = resolveSigner();
					if (signer && store) await store.delete(getKeyId(signer));
				},
			};
		},
		fetchPlugins: [
			{
				id: "erc8128-signer",
				name: "erc8128-signer",
				init: async (url: string, fetchOptions?: BetterFetchOption) => {
					const signer = resolveSigner();
					if (!signer) return { url, options: fetchOptions };

					const baseURL: string = (fetchOptions?.baseURL as string) || "";
					const fullUrl = buildFullUrl(baseURL, url);

					if (SKIP_PATHS.some((path) => fullUrl.endsWith(path))) {
						return { url, options: fetchOptions };
					}

					let parsedUrl: URL;
					try {
						parsedUrl = new URL(fullUrl);
					} catch {
						return { url, options: fetchOptions };
					}

					const method = (
						(fetchOptions?.method as string) || "GET"
					).toUpperCase();
					const client = getClient(signer);
					const keyId = getKeyId(signer);
					const requestInit: RequestInitWithDuplex = {
						method,
						headers: (fetchOptions?.headers as HeadersInit) || {},
						body: resolveRequestBody(fetchOptions?.body),
						duplex: fetchOptions?.duplex,
					};
					const baseRequest = new Request(fullUrl, requestInit);
					const fetchImpl =
						(fetchOptions?.customFetchImpl as FetchEsque | undefined) ??
						(typeof fetch === "function" ? fetch : undefined);

					if (serverConfig) {
						client.setServerConfig(parsedUrl.origin, serverConfig);
					}

					const initialSignOptions = computeInitialSignOptions(
						baseRequest,
						baseURL || undefined,
					);
					const initialSignedRequest = await signRequestWithCache({
						request: baseRequest,
						client,
						keyId,
						store,
						margin,
						signOptions: initialSignOptions,
					});
					if (
						!initialSignedRequest.signature ||
						!initialSignedRequest.signatureInput
					) {
						return { url, options: fetchOptions };
					}

					const customFetchImpl =
						fetchImpl &&
						(async (input: RequestInfo | URL, init?: RequestInit) => {
							const firstResponse = await fetchImpl(input, init);
							if (firstResponse.status !== 401) {
								return firstResponse;
							}

							const acceptSignature =
								firstResponse.headers.get("accept-signature");
							if (!acceptSignature) {
								return firstResponse;
							}

							try {
								const parsed = parseAcceptSignatureHeader(
									acceptSignature,
									baseRequest.clone(),
								);
								const retrySignOptions = selectAcceptSignatureRetryOptions({
									members: parsed,
									requestShape: baseRequest.clone(),
									attemptedOptions: [initialSignOptions],
								});

								if (!retrySignOptions) {
									return firstResponse;
								}

								const normalizedRetrySignOptions =
									normalizeAcceptSignatureSignOptions(retrySignOptions);
								if (
									normalizedRetrySignOptions.binding ===
										initialSignOptions.binding &&
									normalizedRetrySignOptions.replay ===
										initialSignOptions.replay &&
									arraysEqual(
										normalizedRetrySignOptions.components,
										initialSignOptions.components,
									)
								) {
									return firstResponse;
								}

								let response = firstResponse;
								for (
									let attempt = 0;
									attempt < MAX_ACCEPT_SIGNATURE_RETRIES;
									attempt++
								) {
									const retriedRequest = await signRequestWithCache({
										request: baseRequest,
										client,
										keyId,
										store,
										margin,
										signOptions: normalizedRetrySignOptions,
									});
									if (
										!retriedRequest.signature ||
										!retriedRequest.signatureInput
									) {
										return firstResponse;
									}

									const retryHeaders = new Headers(baseRequest.headers);
									retryHeaders.set("signature", retriedRequest.signature);
									retryHeaders.set(
										"signature-input",
										retriedRequest.signatureInput,
									);
									const retryRequest = new Request(baseRequest.clone(), {
										headers: retryHeaders,
									});
									response = await fetchImpl(retryRequest.clone());
								}
								return response;
							} catch {
								return firstResponse;
							}
						});

					return {
						url,
						options: {
							...fetchOptions,
							headers: initialSignedRequest.headers,
							...(customFetchImpl ? { customFetchImpl } : {}),
						},
					};
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};

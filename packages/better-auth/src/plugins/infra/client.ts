import type { BetterAuthClientPlugin } from "better-auth";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_IDENTIFY_URL = "https://kv.better-auth.com";

// ============================================================================
// Types
// ============================================================================

interface FingerprintComponents {
	screenResolution: string;
	colorDepth: number;
	pixelRatio: number;
	userAgent: string;
	platform: string;
	language: string;
	languages: string[];
	cookiesEnabled: boolean;
	doNotTrack: string | null;
	hardwareConcurrency: number;
	deviceMemory: number | undefined;
	maxTouchPoints: number;
	timezone: string;
	timezoneOffset: number;
	canvas: string;
	webgl: {
		vendor: string;
		renderer: string;
		extensions: string[];
	} | null;
	audio: number | null;
	fonts: string[];
	localStorage: boolean;
	sessionStorage: boolean;
	indexedDB: boolean;
	webdriver: boolean;
	plugins: string[];
	touchSupport: boolean;
	pdfViewerEnabled: boolean;
	oscpu: string | undefined;
	vendor: string;
	vendorSub: string;
	productSub: string;
	connectionType: string | undefined;
	downlink: number | undefined;
	rtt: number | undefined;
}

interface FingerprintResult {
	visitorId: string;
	requestId: string;
	confidence: number;
	components: Partial<FingerprintComponents>;
}

interface IdentifyPayload {
	visitorId: string;
	requestId: string;
	confidence: number;
	components: Partial<FingerprintComponents>;
	url: string;
	incognito: boolean;
}

async function sha256(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateRequestId(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	const hex = Array.from(array)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function murmurhash3(str: string, seed = 0): number {
	let h1 = seed;
	const c1 = 0xcc9e2d51;
	const c2 = 0x1b873593;

	for (let i = 0; i < str.length; i++) {
		let k1 = str.charCodeAt(i);
		k1 = Math.imul(k1, c1);
		k1 = (k1 << 15) | (k1 >>> 17);
		k1 = Math.imul(k1, c2);
		h1 ^= k1;
		h1 = (h1 << 13) | (h1 >>> 19);
		h1 = Math.imul(h1, 5) + 0xe6546b64;
	}

	h1 ^= str.length;
	h1 ^= h1 >>> 16;
	h1 = Math.imul(h1, 0x85ebca6b);
	h1 ^= h1 >>> 13;
	h1 = Math.imul(h1, 0xc2b2ae35);
	h1 ^= h1 >>> 16;

	return h1 >>> 0;
}

// ============================================================================
// Fingerprint Component Collectors
// ============================================================================

function getScreenInfo(): Partial<FingerprintComponents> {
	return {
		screenResolution: `${screen.width}x${screen.height}`,
		colorDepth: screen.colorDepth,
		pixelRatio: window.devicePixelRatio || 1,
	};
}

function getBrowserInfo(): Partial<FingerprintComponents> {
	const nav = navigator as Navigator & {
		oscpu?: string;
		pdfViewerEnabled?: boolean;
		vendorSub?: string;
		productSub?: string;
	};

	return {
		userAgent: navigator.userAgent,
		platform: navigator.platform,
		language: navigator.language,
		languages: [...(navigator.languages || [])],
		cookiesEnabled: navigator.cookieEnabled,
		doNotTrack: navigator.doNotTrack,
		vendor: navigator.vendor || "",
		vendorSub: nav.vendorSub || "",
		productSub: nav.productSub || "",
		oscpu: nav.oscpu,
		pdfViewerEnabled: nav.pdfViewerEnabled ?? false,
	};
}

function getHardwareInfo(): Partial<FingerprintComponents> {
	const nav = navigator as Navigator & { deviceMemory?: number };

	return {
		hardwareConcurrency: navigator.hardwareConcurrency || 0,
		deviceMemory: nav.deviceMemory,
		maxTouchPoints: navigator.maxTouchPoints || 0,
	};
}

function getTimezoneInfo(): Partial<FingerprintComponents> {
	let timezone = "";
	try {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		timezone = "unknown";
	}

	return {
		timezone,
		timezoneOffset: new Date().getTimezoneOffset(),
	};
}

function getCanvasFingerprint(): string {
	try {
		const canvas = document.createElement("canvas");
		canvas.width = 280;
		canvas.height = 60;
		const ctx = canvas.getContext("2d");

		if (!ctx) return "no-canvas";

		ctx.fillStyle = "#f60";
		ctx.fillRect(100, 1, 62, 20);

		ctx.fillStyle = "#069";
		ctx.font = "14px 'Arial'";
		ctx.fillText("Fingerprint Canvas", 2, 15);

		ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
		ctx.font = "18px 'Times New Roman'";
		ctx.fillText("Security Check", 4, 45);

		ctx.beginPath();
		ctx.arc(50, 50, 20, 0, Math.PI * 2, true);
		ctx.closePath();
		ctx.fillStyle = "#8B4513";
		ctx.fill();

		const gradient = ctx.createLinearGradient(0, 0, 280, 0);
		gradient.addColorStop(0, "red");
		gradient.addColorStop(0.5, "green");
		gradient.addColorStop(1, "blue");
		ctx.fillStyle = gradient;
		ctx.fillRect(200, 30, 75, 25);

		ctx.beginPath();
		ctx.moveTo(170, 10);
		ctx.bezierCurveTo(130, 100, 230, 100, 190, 10);
		ctx.strokeStyle = "#FF1493";
		ctx.lineWidth = 2;
		ctx.stroke();

		const dataUrl = canvas.toDataURL();
		return murmurhash3(dataUrl).toString(36);
	} catch {
		return "canvas-error";
	}
}

function getWebGLFingerprint(): FingerprintComponents["webgl"] {
	try {
		const canvas = document.createElement("canvas");
		const gl =
			canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

		if (!gl || !(gl instanceof WebGLRenderingContext)) return null;

		const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
		const vendor = debugInfo
			? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
			: gl.getParameter(gl.VENDOR);
		const renderer = debugInfo
			? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
			: gl.getParameter(gl.RENDERER);

		const extensions = gl.getSupportedExtensions() || [];

		return {
			vendor: vendor || "unknown",
			renderer: renderer || "unknown",
			extensions: extensions.sort(),
		};
	} catch {
		return null;
	}
}

async function getAudioFingerprint(): Promise<number | null> {
	try {
		const AudioContextClass =
			window.AudioContext ||
			((window as typeof window & { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext as typeof AudioContext);
		if (!AudioContextClass) return null;

		const context = new AudioContextClass();
		const oscillator = context.createOscillator();
		const analyser = context.createAnalyser();
		const gain = context.createGain();
		const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

		gain.gain.value = 0;
		oscillator.type = "triangle";
		oscillator.frequency.setValueAtTime(10000, context.currentTime);

		oscillator.connect(analyser);
		analyser.connect(scriptProcessor);
		scriptProcessor.connect(gain);
		gain.connect(context.destination);

		oscillator.start(0);

		let resolved = false;

		const cleanup = () => {
			if (resolved) return;
			resolved = true;
			try {
				oscillator.stop();
				oscillator.disconnect();
				analyser.disconnect();
				scriptProcessor.disconnect();
				gain.disconnect();
			} catch {
				/* ignore */
			}
			try {
				if (context.state !== "closed") {
					context.close();
				}
			} catch {
				/* ignore */
			}
		};

		return new Promise((resolve) => {
			scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
				if (resolved) return;

				const output = e.inputBuffer.getChannelData(0);
				let sum = 0;
				for (let i = 0; i < output.length; i++) {
					const val = output[i];
					if (val !== undefined) {
						sum += Math.abs(val);
					}
				}

				cleanup();
				resolve(sum);
			};

			setTimeout(() => {
				if (resolved) return;
				cleanup();
				resolve(null);
			}, 1000);
		});
	} catch {
		return null;
	}
}

function detectFonts(): string[] {
	const baseFonts = ["monospace", "sans-serif", "serif"];
	const testFonts = [
		"Arial",
		"Arial Black",
		"Calibri",
		"Cambria",
		"Comic Sans MS",
		"Consolas",
		"Courier New",
		"Georgia",
		"Helvetica",
		"Impact",
		"Lucida Console",
		"Monaco",
		"Segoe UI",
		"Tahoma",
		"Times New Roman",
		"Trebuchet MS",
		"Verdana",
		"Futura",
		"Geneva",
		"Gill Sans",
		"Menlo",
		"SF Pro",
		"DejaVu Sans",
		"Ubuntu",
	];

	const testString = "mmmmmmmmmmlli";
	const testSize = "72px";

	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return [];

	const getWidth = (font: string): number => {
		ctx.font = `${testSize} ${font}`;
		return ctx.measureText(testString).width;
	};

	const baseWidths: Record<string, number> = {};
	baseFonts.forEach((font) => {
		baseWidths[font] = getWidth(font);
	});

	const detectedFonts: string[] = [];

	testFonts.forEach((font) => {
		for (const baseFont of baseFonts) {
			const width = getWidth(`'${font}', ${baseFont}`);
			if (width !== baseWidths[baseFont]) {
				detectedFonts.push(font);
				break;
			}
		}
	});

	return detectedFonts.sort();
}

function getStorageInfo(): Partial<FingerprintComponents> {
	const checkStorage = (storage: Storage | null): boolean => {
		if (!storage) return false;
		try {
			const key = "__fp_test__";
			storage.setItem(key, "1");
			storage.removeItem(key);
			return true;
		} catch {
			return false;
		}
	};

	return {
		localStorage: checkStorage(window.localStorage),
		sessionStorage: checkStorage(window.sessionStorage),
		indexedDB: !!window.indexedDB,
	};
}

function getBrowserFeatures(): Partial<FingerprintComponents> {
	const plugins: string[] = [];

	if (navigator.plugins) {
		for (let i = 0; i < navigator.plugins.length; i++) {
			const plugin = navigator.plugins[i];
			if (plugin) {
				plugins.push(plugin.name);
			}
		}
	}

	return {
		webdriver: !!(navigator as Navigator & { webdriver?: boolean }).webdriver,
		plugins: plugins.sort(),
		touchSupport: "ontouchstart" in window || navigator.maxTouchPoints > 0,
	};
}

function getConnectionInfo(): Partial<FingerprintComponents> {
	const connection = (
		navigator as Navigator & {
			connection?: {
				effectiveType?: string;
				downlink?: number;
				rtt?: number;
			};
		}
	).connection;

	return {
		connectionType: connection?.effectiveType,
		downlink: connection?.downlink,
		rtt: connection?.rtt,
	};
}

function detectIncognito(): boolean {
	try {
		// Check if storage quota is limited (common in incognito)
		if ("storage" in navigator && "estimate" in navigator.storage) {
			return false; // Can't detect synchronously
		}
		return false;
	} catch {
		return true;
	}
}

// ============================================================================
// Main Fingerprint Functions
// ============================================================================

async function collectFingerprint(): Promise<Partial<FingerprintComponents>> {
	const components: Partial<FingerprintComponents> = {};

	try {
		Object.assign(components, getScreenInfo());
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getBrowserInfo());
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getHardwareInfo());
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getTimezoneInfo());
	} catch {
		/* ignore */
	}

	try {
		components.canvas = getCanvasFingerprint();
	} catch {
		/* ignore */
	}

	try {
		components.webgl = getWebGLFingerprint();
	} catch {
		/* ignore */
	}

	try {
		components.fonts = detectFonts();
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getStorageInfo());
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getBrowserFeatures());
	} catch {
		/* ignore */
	}

	try {
		Object.assign(components, getConnectionInfo());
	} catch {
		/* ignore */
	}

	try {
		components.audio = await getAudioFingerprint();
	} catch {
		/* ignore */
	}

	return components;
}

async function generateVisitorId(
	components: Partial<FingerprintComponents>,
): Promise<string> {
	const stableData = {
		screenResolution: components.screenResolution,
		colorDepth: components.colorDepth,
		pixelRatio: components.pixelRatio,
		platform: components.platform,
		hardwareConcurrency: components.hardwareConcurrency,
		deviceMemory: components.deviceMemory,
		timezone: components.timezone,
		canvas: components.canvas,
		webgl: components.webgl,
		fonts: components.fonts,
		maxTouchPoints: components.maxTouchPoints,
	};

	const dataString = JSON.stringify(stableData);
	const hash = await sha256(dataString);

	return hash.slice(0, 20);
}

function calculateConfidence(
	components: Partial<FingerprintComponents>,
): number {
	const weights: Record<string, number> = {
		canvas: 15,
		webgl: 15,
		audio: 10,
		fonts: 15,
		screenResolution: 5,
		colorDepth: 3,
		pixelRatio: 5,
		hardwareConcurrency: 5,
		deviceMemory: 5,
		timezone: 5,
		platform: 3,
		maxTouchPoints: 3,
		plugins: 6,
		localStorage: 2,
		sessionStorage: 2,
		indexedDB: 1,
	};

	let score = 0;
	let maxScore = 0;

	for (const [key, weight] of Object.entries(weights)) {
		maxScore += weight;
		const value = components[key as keyof FingerprintComponents];
		if (
			value !== undefined &&
			value !== null &&
			value !== "" &&
			!(Array.isArray(value) && value.length === 0)
		) {
			score += weight;
		}
	}

	return Math.round((score / maxScore) * 100) / 100;
}

// ============================================================================
// Cached State
// ============================================================================

let cachedFingerprint: FingerprintResult | null = null;
let fingerprintPromise: Promise<FingerprintResult> | null = null;
let identifySent = false;
let configuredIdentifyUrl = DEFAULT_IDENTIFY_URL;

async function getFingerprint(): Promise<FingerprintResult | null> {
	if (typeof window === "undefined") {
		return null;
	}

	if (await cachedFingerprint) {
		return cachedFingerprint;
	}

	if (await fingerprintPromise) {
		return fingerprintPromise;
	}

	fingerprintPromise = (async () => {
		const components = await collectFingerprint();
		const visitorId = await generateVisitorId(components);
		const confidence = calculateConfidence(components);

		const result: FingerprintResult = {
			visitorId,
			requestId: generateRequestId(),
			confidence,
			components,
		};

		cachedFingerprint = result;
		return result;
	})();

	try {
		return await fingerprintPromise;
	} catch {
		// Silently fail - fingerprinting is best-effort
		fingerprintPromise = null;
		return null;
	}
}

// Promise that resolves when identify call completes (success or failure)
let identifyCompletePromise: Promise<void> | null = null;
let identifyCompleteResolve: (() => void) | null = null;

async function sendIdentify(): Promise<void> {
	if (identifySent || typeof window === "undefined") {
		return;
	}

	const fingerprint = await getFingerprint();
	if (!fingerprint) {
		return;
	}

	identifySent = true;

	// Create promise to track completion
	identifyCompletePromise = new Promise((resolve) => {
		identifyCompleteResolve = resolve;
	});

	const payload: IdentifyPayload = {
		visitorId: fingerprint.visitorId,
		requestId: fingerprint.requestId,
		confidence: fingerprint.confidence,
		components: fingerprint.components,
		url: window.location.href,
		incognito: detectIncognito(),
	};

	try {
		// Actually await the response to ensure server has received the data
		// POST /identify is public (no API key needed)
		await fetch(`${configuredIdentifyUrl}/identify`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	} catch {
		// Silently fail - identification is best-effort
	} finally {
		// Mark identify as complete regardless of success/failure
		identifyCompleteResolve?.();
	}
}

/**
 * Wait for identify to complete, with a timeout
 * Returns immediately if identify hasn't started or has completed
 */
async function waitForIdentify(timeoutMs = 500): Promise<void> {
	if (!identifyCompletePromise) return;

	await Promise.race([
		identifyCompletePromise,
		new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
	]);
}

// ============================================================================
// Plugin Export
// ============================================================================

// ============================================================================
// Proof of Work Challenge Solver (Browser-compatible)
// ============================================================================

interface PoWChallenge {
	nonce: string;
	difficulty: number;
	timestamp: number;
	ttl: number;
}

interface PoWSolution {
	nonce: string;
	counter: number;
}

/**
 * Check if a hash has the required number of leading zero bits
 */
function hasLeadingZeroBits(hash: string, bits: number): boolean {
	const fullHexChars = Math.floor(bits / 4);
	const remainingBits = bits % 4;

	for (let i = 0; i < fullHexChars; i++) {
		if (hash[i] !== "0") return false;
	}

	if (remainingBits > 0 && fullHexChars < hash.length) {
		const charValue = parseInt(hash[fullHexChars]!, 16);
		const maxValue = (1 << (4 - remainingBits)) - 1;
		if (charValue > maxValue) return false;
	}

	return true;
}

/**
 * Solve a PoW challenge
 * @returns solution or null if challenge couldn't be solved
 */
async function solvePoWChallenge(
	challenge: PoWChallenge,
): Promise<PoWSolution> {
	const { nonce, difficulty } = challenge;
	let counter = 0;

	while (true) {
		const input = `${nonce}:${counter}`;
		const hash = await sha256(input);

		if (hasLeadingZeroBits(hash, difficulty)) {
			return { nonce, counter };
		}

		counter++;

		// Yield to event loop every 1000 iterations to prevent blocking UI
		if (counter % 1000 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		// Safety limit - don't loop forever
		if (counter > 100000000) {
			throw new Error("PoW challenge took too long to solve");
		}
	}
}

/**
 * Decode a base64-encoded challenge string
 */
function decodePoWChallenge(encoded: string): PoWChallenge | null {
	try {
		const decoded = atob(encoded);
		return JSON.parse(decoded);
	} catch {
		return null;
	}
}

/**
 * Encode a solution to base64
 */
function encodePoWSolution(solution: PoWSolution): string {
	return btoa(JSON.stringify(solution));
}

// ============================================================================
// Plugin Export
// ============================================================================

export interface DashClientOptions {
	/**
	 * The URL of the identification service
	 * @default "https://id.better-auth.com"
	 */
	identifyUrl?: string;
	/**
	 * Whether to automatically solve PoW challenges (default: true)
	 */
	autoSolveChallenge?: boolean;
	/**
	 * Callback when a PoW challenge is received
	 */
	onChallengeReceived?: (reason: string) => void;
	/**
	 * Callback when a PoW challenge is solved
	 */
	onChallengeSolved?: (solveTimeMs: number) => void;
	/**
	 * Callback when a PoW challenge fails to solve
	 */
	onChallengeFailed?: (error: Error) => void;
}

export const dashClient = (options?: DashClientOptions) => {
	const autoSolve = options?.autoSolveChallenge !== false;

	// Configure identify URL if provided
	if (options?.identifyUrl) {
		configuredIdentifyUrl = options.identifyUrl;
	}

	// Start fingerprinting and send identify on load
	if (typeof window !== "undefined") {
		// Schedule identify call - use multiple strategies to ensure it runs
		const scheduleIdentify = () => {
			if ("requestIdleCallback" in window) {
				(
					window as Window & { requestIdleCallback: (cb: () => void) => void }
				).requestIdleCallback(() => {
					sendIdentify();
				});
			} else {
				setTimeout(() => {
					sendIdentify();
				}, 100);
			}
		};

		// If document is already loaded, run immediately
		if (document.readyState === "complete") {
			scheduleIdentify();
		} else {
			// Otherwise wait for load
			window.addEventListener("load", scheduleIdentify, { once: true });
		}
	}

	return {
		id: "dash",
		fetchPlugins: [
			{
				id: "dash-fingerprint",
				name: "dash-fingerprint",
				hooks: {
					async onRequest(context) {
						if (typeof window === "undefined") {
							return context;
						}

						// Wait for identify to complete (or timeout after 500ms)
						// This ensures the server has the identification data stored
						// before we send auth requests with the requestId
						await waitForIdentify(500);

						const fingerprint = await getFingerprint();
						if (!fingerprint) {
							return context;
						}

						// Add fingerprint headers to the request
						// Use the same requestId that was sent to /identify
						const headers = context.headers || new Headers();
						if (headers instanceof Headers) {
							headers.set("X-Visitor-Id", fingerprint.visitorId);
							headers.set("X-Request-Id", fingerprint.requestId);
						}

						return {
							...context,
							headers,
						};
					},
				},
			},
			{
				id: "dash-pow-solver",
				name: "dash-pow-solver",
				hooks: {
					async onResponse(context) {
						if (typeof window === "undefined") {
							return context;
						}

						// Check for 423 status (PoW challenge required)
						if (context.response.status !== 423 || !autoSolve) {
							return context;
						}

						// Get challenge from header
						const challengeHeader =
							context.response.headers.get("X-PoW-Challenge");
						const reason = context.response.headers.get("X-PoW-Reason") || "";

						if (!challengeHeader) {
							return context;
						}

						// Notify that challenge was received
						options?.onChallengeReceived?.(reason);

						// Decode challenge
						const challenge = decodePoWChallenge(challengeHeader);
						if (!challenge) {
							return context;
						}

						try {
							// Solve the challenge
							const startTime = Date.now();
							const solution = await solvePoWChallenge(challenge);
							const solveTime = Date.now() - startTime;

							// Notify that challenge was solved
							options?.onChallengeSolved?.(solveTime);

							// Get the original request details
							const originalUrl = context.response.url;
							const fingerprint = await getFingerprint();

							// Retry the request with the solution header
							const retryHeaders = new Headers();
							retryHeaders.set("X-PoW-Solution", encodePoWSolution(solution));
							if (fingerprint) {
								retryHeaders.set("X-Visitor-Id", fingerprint.visitorId);
								retryHeaders.set("X-Request-Id", fingerprint.requestId);
							}
							retryHeaders.set("Content-Type", "application/json");

							// Clone the original body if it exists
							let body: BodyInit | undefined;
							if (context.request && context.request.body) {
								// For a retry, we need to reconstruct the body
								// The original body might have been consumed
								// We store it in context during onRequest
								body = (context.request as { _originalBody?: BodyInit })
									._originalBody;
							}

							const retryResponse = await fetch(originalUrl, {
								method: context.request?.method || "POST",
								headers: retryHeaders,
								body,
								credentials: "include",
							});

							// Return the retry response
							return {
								...context,
								response: retryResponse,
							};
						} catch (error) {
							console.error("[Dash] Failed to solve PoW challenge:", error);
							options?.onChallengeFailed?.(
								error instanceof Error ? error : new Error(String(error)),
							);
							return context;
						}
					},
					async onRequest(context) {
						// Store the body for potential retry
						if (context.body) {
							(context as { _originalBody?: BodyInit })._originalBody =
								context.body;
						}
						return context;
					},
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};

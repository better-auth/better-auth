import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
import { base64 } from "@better-auth/utils/base64";
import type { BetterFetch } from "@better-fetch/fetch";
import type { ElectronClientOptions } from "./client";

const DEFAULT_MAX_BYTES = 1024 * 1024 * 5; // 5MB
const MAX_CACHE_SIZE = 100;
const userImageCache = new Map<string, string>();

function setUserImageCache(
	map: Map<string, string>,
	key: string,
	value: string,
) {
	if (map.size >= MAX_CACHE_SIZE) {
		const firstKey = map.keys().next().value;
		if (firstKey) {
			map.delete(firstKey);
		}
	}
	map.set(key, value);
}

async function fetchUserImage(
	$fetch: BetterFetch,
	url: string,
	options?: Pick<ElectronClientOptions, "userImageMaxSize"> | undefined,
): Promise<string | null> {
	if (isValidDataImageUrl(url)) return url;

	const cached = userImageCache.get(url);
	if (cached) return cached;

	// Validate URL
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		if (!isDevelopment() && isLocalOrigin(parsed)) return null;
	} catch {
		return null;
	}

	let result: string | null = null;
	await $fetch(url, {
		method: "GET",
		headers: { accept: "image/*" },
		async onSuccess({ data, response }) {
			if (
				!response.headers.get("content-type")?.startsWith("image/") ||
				response.headers.get("content-type")?.startsWith("image/svg")
			) {
				return;
			}
			const maxSize = options?.userImageMaxSize ?? DEFAULT_MAX_BYTES;
			const contentLength = response.headers.get("content-length");
			if (contentLength && Number(contentLength) > maxSize) {
				return;
			}
			const buffer =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(await (data as Blob).arrayBuffer());
			if (buffer.byteLength > maxSize) return;

			const imageType = detectImageType(buffer);
			if (!imageType) return;

			const encoded = base64.encode(buffer);
			const dataUrl = `data:image/${imageType};base64,${encoded}`;

			setUserImageCache(userImageCache, url, dataUrl);
			result = dataUrl;
		},
	});

	return result;
}

export async function normalizeUser<U extends User & Record<string, any>>(
	$fetch: BetterFetch,
	user: U,
): Promise<U> {
	const result = { ...user };
	if (result.image) {
		result.image = await fetchUserImage($fetch, result.image);
	}

	return result;
}

function isLocalOrigin(parsed: URL): boolean {
	const hostname = parsed.hostname.toLowerCase();
	if (hostname === "localhost") return true;
	// IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
	const m = hostname.match(ipv4);
	if (m) {
		const a = Number(m[1]);
		const b = Number(m[2]);
		if (a === 127) return true;
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 169 && b === 254) return true;
		return false;
	}
	// IPv6: ::1 (loopback), fe80::/10 (link-local)
	const h = hostname.replace(/^\[|\]$/g, "");
	if (h === "::1" || /^(0:){7}1$/.test(h) || h === "0:0:0:0:0:0:0:1")
		return true;
	if (/^fe[89ab][0-9a-f]/i.test(h)) return true;
	return false;
}

function isValidDataImageUrl(
	url: string,
	options?: Pick<ElectronClientOptions, "userImageMaxSize"> | undefined,
): boolean {
	const maxBase64Size = Math.ceil(
		((options?.userImageMaxSize ?? DEFAULT_MAX_BYTES) * 4) / 3,
	);
	const lower = url.toLowerCase();
	if (!lower.startsWith("data:image/") || lower.startsWith("data:image/svg")) {
		return false;
	}
	const base64Marker = ";base64,";
	const markerIdx = lower.indexOf(base64Marker);
	if (markerIdx === -1) return false;
	const payload = url.slice(markerIdx + base64Marker.length);
	if (payload.length === 0 || payload.length > maxBase64Size) return false;
	try {
		const decoded = base64.decode(payload);
		return detectImageType(decoded) !== null;
	} catch {
		return false;
	}
}

type SupportedImageType =
	| "png"
	| "jpg"
	| "gif"
	| "bmp"
	| "webp"
	| "avif"
	| "heic"
	| "heif"
	| "tiff"
	| "ico";

function detectImageType(bytes: Uint8Array): SupportedImageType | null {
	if (bytes.length < 12) return null;

	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "png";
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "jpg";
	}

	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "gif";
	}

	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "webp";
	}

	if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
		return "bmp";
	}

	if (
		(bytes[0] === 0x49 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x2a &&
			bytes[3] === 0x00) ||
		(bytes[0] === 0x4d &&
			bytes[1] === 0x4d &&
			bytes[2] === 0x00 &&
			bytes[3] === 0x2a)
	) {
		return "tiff";
	}

	if (
		bytes[0] === 0x00 &&
		bytes[1] === 0x00 &&
		bytes[2] === 0x01 &&
		bytes[3] === 0x00
	) {
		return "ico";
	}

	// avif, heic, heif
	if (bytes.length < 16) return null;

	const fTyp = String.fromCharCode(...bytes.slice(4, 8));
	if (fTyp !== "ftyp") return null;

	const brand = String.fromCharCode(...bytes.slice(8, 12));

	if (brand === "avif" || brand === "heic" || brand === "heif") {
		return brand;
	}
	if (
		brand === "heix" ||
		brand === "hevc" ||
		brand === "mif1" ||
		brand === "msf1"
	) {
		return "heic";
	}

	return null;
}

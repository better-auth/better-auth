import type { BetterAuthClientOptions } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
import { base64 } from "@better-auth/utils/base64";
import { getBaseURL } from "better-auth";
import type { ElectronClientOptions } from "./client";

const DEFAULT_MAX_BYTES = 1024 * 1024 * 5; // 5MB
const MAX_CACHE_SIZE = 100;
const userImageCache = new Map<string, string>();

function setUserImageCache(key: string, value: string) {
	if (userImageCache.size >= MAX_CACHE_SIZE) {
		const firstKey = userImageCache.keys().next().value;
		if (firstKey) {
			userImageCache.delete(firstKey);
		}
	}
	userImageCache.set(key, value);
}

async function readUserImageStream(
	response: Response,
	maxSize: number = DEFAULT_MAX_BYTES,
): Promise<Uint8Array | null> {
	const body = response.body;
	if (!body) return null;

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let totalSize = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalSize += value.byteLength;
			if (totalSize > maxSize) {
				reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} catch {
		return null;
	}

	if (chunks.length === 1) return chunks[0] ?? null;

	const result = new Uint8Array(totalSize);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

async function fetchUserImage(
	baseURL: string | undefined,
	url: string,
	options?: Pick<ElectronClientOptions, "userImageProxy"> | undefined,
): Promise<string | null> {
	if (
		options?.userImageProxy?.enabled === false ||
		isValidDataImageUrl(url, options?.userImageProxy?.maxSize)
	) {
		return url;
	}

	const cached = userImageCache.get(url);
	if (cached) return cached;

	// Validate and resolve URL
	let resolvedUrl: string;
	try {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			if (!baseURL) return null;
			const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
			const relative = url.startsWith("/") ? url.slice(1) : url;
			parsed = new URL(relative, base);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		if (!isDevelopment() && isLocalOrigin(parsed)) return null;
		resolvedUrl = parsed.href;
	} catch {
		return null;
	}

	try {
		const {
			maxSize = DEFAULT_MAX_BYTES,
			accept = "image/*",
			customValidator: validateImage = detectImageType,
		} = options?.userImageProxy ?? {};
		const response = await fetch(resolvedUrl, {
			method: "GET",
			headers: { accept },
		});

		if (!response.ok) return null;

		const contentType = response.headers.get("content-type");
		if (
			!contentType?.startsWith("image/") ||
			contentType.startsWith("image/svg")
		) {
			return null;
		}

		const contentLength = response.headers.get("content-length");
		if (contentLength && Number(contentLength) > maxSize) {
			return null;
		}

		const buffer = await readUserImageStream(response, maxSize);
		if (!buffer) return null;

		const imageType = validateImage(buffer);
		if (!imageType) return null;

		const mimeType = contentType.split(";")[0]?.trim() || imageType;
		const encoded = base64.encode(buffer);
		const dataUrl = `data:${mimeType};base64,${encoded}`;

		setUserImageCache(url, dataUrl);
		return dataUrl;
	} catch {
		return null;
	}
}

export async function normalizeUser<U extends User & Record<string, any>>(
	clientOptions:
		| Pick<BetterAuthClientOptions, "baseURL" | "basePath">
		| undefined,
	user: U,
): Promise<U> {
	const baseURL = getBaseURL(
		clientOptions?.baseURL,
		clientOptions?.basePath,
		undefined,
		true,
	);
	const result = { ...user };
	if (result.image) {
		result.image = await fetchUserImage(baseURL, result.image);
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
	maxSize: number = DEFAULT_MAX_BYTES,
): boolean {
	const maxBase64Size = Math.ceil((maxSize * 4) / 3);
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
	| "image/png"
	| "image/jpg"
	| "image/gif"
	| "image/bmp"
	| "image/webp"
	| "image/avif"
	| "image/heic"
	| "image/heif"
	| "image/tiff"
	| "image/x-icon";

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
		return "image/png";
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpg";
	}

	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
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
		return "image/webp";
	}

	if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
		return "image/bmp";
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
		return "image/tiff";
	}

	if (
		bytes[0] === 0x00 &&
		bytes[1] === 0x00 &&
		bytes[2] === 0x01 &&
		bytes[3] === 0x00
	) {
		return "image/x-icon";
	}

	// avif, heic, heif
	if (bytes.length < 16) return null;

	const fTyp = String.fromCharCode(...bytes.slice(4, 8));
	if (fTyp !== "ftyp") return null;

	const brand = String.fromCharCode(...bytes.slice(8, 12));

	if (brand === "avif" || brand === "heic" || brand === "heif") {
		return `image/${brand}`;
	}
	if (
		brand === "heix" ||
		brand === "hevc" ||
		brand === "mif1" ||
		brand === "msf1"
	) {
		return "image/heic";
	}

	return null;
}

import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { base64 } from "@better-auth/utils/base64";
import electron from "electron";
import type { ElectronClientOptions } from "./client";

const { net } = electron;

const DEFAULT_MAX_BYTES = 1024 * 1024 * 5; // 5MB

export type FetchUserImageResult = {
	stream: ReadableStream<Uint8Array>;
	mimeType: string;
};

export async function fetchUserImage(
	baseURL: string | undefined,
	url: string,
	options?: Pick<ElectronClientOptions, "userImageProxy"> | undefined,
): Promise<FetchUserImageResult | null> {
	if (options?.userImageProxy?.enabled === false) return null;

	// Handle data URLs
	const decoded = await decodeDataImageUrl(url, options);
	if (decoded) {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(decoded.bytes);
				controller.close();
			},
		});
		return { stream, mimeType: decoded.mimeType };
	}

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
		if (!isDevelopment() && !isPublicRoutableHost(parsed.hostname)) return null;
		resolvedUrl = parsed.href;
	} catch {
		return null;
	}

	const {
		maxSize = DEFAULT_MAX_BYTES,
		accept = "image/*",
		customValidator: validateImage = detectImageType,
	} = options?.userImageProxy ?? {};

	const response = await net.fetch(resolvedUrl, {
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

	const body = response.body;
	if (!body) return null;

	const mimeType = contentType.split(";")[0]?.trim() || "image/png";
	const reader = body.getReader();
	let totalSize = 0;
	let firstChunk = true;

	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				return;
			}

			totalSize += value.byteLength;
			if (totalSize > maxSize) {
				reader.cancel();
				controller.error(new Error("Image exceeds maximum size"));
				return;
			}

			if (firstChunk) {
				firstChunk = false;
				if (!validateImage(value)) {
					reader.cancel();
					controller.error(new Error("Invalid image type"));
					return;
				}
			}

			controller.enqueue(value);
		},
		cancel() {
			reader.cancel();
		},
	});

	return { stream, mimeType };
}

export function normalizeUserOutput<U extends User & Record<string, any>>(
	user: U,
	options?: ElectronClientOptions | undefined,
): U {
	const result = { ...user };
	if (result.image && options?.userImageProxy?.enabled !== false) {
		result.image = `${options?.userImageProxy?.scheme || "user-image"}://${result.id}`;
	}

	return result;
}

async function decodeDataImageUrl(
	url: string,
	options?: Pick<ElectronClientOptions, "userImageProxy"> | undefined,
) {
	const maxSize = options?.userImageProxy?.maxSize ?? DEFAULT_MAX_BYTES;
	const maxBase64Size = Math.ceil((maxSize * 4) / 3);
	const lower = url.toLowerCase();
	if (!lower.startsWith("data:image/") || lower.startsWith("data:image/svg")) {
		return null;
	}
	const base64Marker = ";base64,";
	const markerIdx = lower.indexOf(base64Marker);
	if (markerIdx === -1) return null;
	const mimeType = url.substring("data:".length, markerIdx);
	const payload = url.substring(markerIdx + base64Marker.length);
	if (!payload || payload.length > maxBase64Size) return null;
	try {
		const bytes = base64.decode(payload);
		const { customValidator: validateImage = detectImageType } =
			options?.userImageProxy ?? {};
		if (!(await validateImage(bytes))) return null;
		return { bytes, mimeType };
	} catch {
		return null;
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

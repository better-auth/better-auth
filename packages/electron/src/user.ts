import type { User } from "@better-auth/core/db";
import { base64 } from "@better-auth/utils/base64";
import type { BetterFetch } from "@better-fetch/fetch";

const MAX_BYTES = 1024 * 1024 * 5; // 5MB
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
	} catch {
		return null;
	}

	let result: string | null = null;
	await $fetch(url, {
		method: "GET",
		headers: { accept: "image/*" },
		async onSuccess({ data, response }) {
			const contentLength = response.headers.get("content-length");
			if (contentLength && Number(contentLength) > MAX_BYTES) {
				return;
			}
			const buffer =
				data instanceof ArrayBuffer
					? new Uint8Array(data)
					: new Uint8Array(await (data as Blob).arrayBuffer());
			if (buffer.byteLength > MAX_BYTES) return;

			const imageType = detectImageType(buffer);
			if (!imageType) return;
			const contentType =
				response.headers.get("content-type")?.split(";")[0] ||
				`image/${imageType}`;

			const encoded = base64.encode(buffer);
			const dataUrl = `data:${contentType};base64,${encoded}`;

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
	if (user.image) {
		user.image = await fetchUserImage($fetch, user.image);
	}

	return user;
}

function isValidDataImageUrl(url: string): boolean {
	const lower = url.toLowerCase();
	if (!lower.startsWith("data:image/") || lower.startsWith("data:image/svg")) {
		return false;
	}
	const comma = url.indexOf(",");
	if (comma === -1 || comma === url.length - 1) return false;
	const payload = url.slice(comma + 1);
	try {
		const decoded = base64.decode(payload);
		if (decoded.byteLength > MAX_BYTES) return false;
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

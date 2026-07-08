import 'dart:convert';

import 'storage.dart';

/// A single cookie entry stored by the client plugin.
final class StoredCookie {
	const StoredCookie({required this.value, this.expires});

	final String value;
	final String? expires;

	Map<String, Object?> toJson() => {
				'value': value,
				'expires': expires,
			};

	factory StoredCookie.fromJson(Map<String, Object?> json) {
		return StoredCookie(
			value: json['value'] as String? ?? '',
			expires: json['expires'] as String?,
		);
	}
}

/// Parses a `Set-Cookie` header into name → attribute map.
///
/// Mirrors the subset of cookie attributes needed by Better Auth clients
/// (`Expires`, `Max-Age`). Multiple cookies may be comma-separated.
Map<String, Map<String, String?>> parseSetCookieHeader(String header) {
	final result = <String, Map<String, String?>>{};
	if (header.trim().isEmpty) return result;

	// Split on commas that precede a new cookie name=value (not date commas).
	final parts = <String>[];
	final buffer = StringBuffer();
	var i = 0;
	while (i < header.length) {
		final char = header[i];
		if (char == ',') {
			final rest = header.substring(i + 1).trimLeft();
			final looksLikeNextCookie = RegExp(r'^[A-Za-z0-9_\-.%]+=')
					.hasMatch(rest);
			if (looksLikeNextCookie) {
				parts.add(buffer.toString().trim());
				buffer.clear();
				i++;
				continue;
			}
		}
		buffer.write(char);
		i++;
	}
	final last = buffer.toString().trim();
	if (last.isNotEmpty) parts.add(last);

	for (final part in parts) {
		final segments = part.split(';');
		if (segments.isEmpty) continue;
		final nameValue = segments.first.split('=');
		if (nameValue.isEmpty) continue;
		final name = nameValue.first.trim();
		if (name.isEmpty) continue;
		final value =
				nameValue.length > 1 ? nameValue.sublist(1).join('=').trim() : '';
		final attrs = <String, String?>{'value': value};
		for (final segment in segments.skip(1)) {
			final kv = segment.split('=');
			final key = kv.first.trim().toLowerCase();
			final attrValue =
					kv.length > 1 ? kv.sublist(1).join('=').trim() : null;
			attrs[key] = attrValue;
		}
		result[name] = attrs;
	}
	return result;
}

/// Merges [setCookieHeader] into previously stored cookie JSON.
///
/// Cookies with `Max-Age=0` or a past `Expires` are removed.
String mergeSetCookie(String setCookieHeader, [String? prevCookieJson]) {
	final parsed = parseSetCookieHeader(setCookieHeader);
	Map<String, StoredCookie> toSet = {};
	if (prevCookieJson != null && prevCookieJson.isNotEmpty) {
		try {
			final prev =
					jsonDecode(prevCookieJson) as Map<String, Object?>? ?? {};
			for (final entry in prev.entries) {
				final value = entry.value;
				if (value is Map<String, Object?>) {
					toSet[entry.key] = StoredCookie.fromJson(value);
				}
			}
		} catch (_) {
			toSet = {};
		}
	}

	for (final entry in parsed.entries) {
		final attrs = entry.value;
		final maxAgeRaw = attrs['max-age'];
		final expiresRaw = attrs['expires'];
		DateTime? expiresAt;
		if (maxAgeRaw != null) {
			final maxAge = int.tryParse(maxAgeRaw);
			if (maxAge != null) {
				if (maxAge <= 0) {
					toSet.remove(entry.key);
					continue;
				}
				expiresAt =
						DateTime.now().toUtc().add(Duration(seconds: maxAge));
			}
		} else if (expiresRaw != null) {
			expiresAt = DateTime.tryParse(expiresRaw)?.toUtc();
			if (expiresAt != null && expiresAt.isBefore(DateTime.now().toUtc())) {
				toSet.remove(entry.key);
				continue;
			}
		}
		toSet[entry.key] = StoredCookie(
			value: attrs['value'] ?? '',
			expires: expiresAt?.toIso8601String(),
		);
	}

	return jsonEncode({
		for (final e in toSet.entries) e.key: e.value.toJson(),
	});
}

/// Builds a Cookie request header from stored cookie JSON.
String buildCookieHeader(String cookieJson) {
	Map<String, Object?> parsed = {};
	try {
		parsed = jsonDecode(cookieJson) as Map<String, Object?>? ?? {};
	} catch (_) {
		return '';
	}
	final parts = <String>[];
	for (final entry in parsed.entries) {
		final value = entry.value;
		if (value is! Map<String, Object?>) continue;
		final cookie = StoredCookie.fromJson(value);
		if (cookie.expires != null) {
			final exp = DateTime.tryParse(cookie.expires!);
			if (exp != null && exp.isBefore(DateTime.now().toUtc())) {
				continue;
			}
		}
		parts.add('${entry.key}=${cookie.value}');
	}
	return parts.join('; ');
}

/// Replaces colons so Keys work with secure stores that reject `:`.
String normalizeStorageKey(String name) => name.replaceAll(':', '_');

/// Max characters written per `setItem`. Mirrors Expo / server chunking.
const int storageValueLimit = 1800;

/// Marker for values split across `<key>.0..N` chunks.
const String chunkMarker = '\u0001ba-chunks:';

/// Storage adapter that chunks oversized values (Keychain / EncryptedSharedPreferences limits).
final class ChunkedAuthStorage implements AuthStorage {
	ChunkedAuthStorage(this._inner);

	final AuthStorage _inner;

	@override
	Future<String?> getItem(String key) async {
		final normalized = normalizeStorageKey(key);
		final stored = await _inner.getItem(normalized);
		if (stored == null || !stored.startsWith(chunkMarker)) {
			return stored;
		}
		final count = int.tryParse(stored.substring(chunkMarker.length));
		if (count == null || count <= 0) return null;
		final buffer = StringBuffer();
		for (var i = 0; i < count; i++) {
			final chunk = await _inner.getItem('$normalized.$i');
			if (chunk == null) return null;
			buffer.write(chunk);
		}
		return buffer.toString();
	}

	@override
	Future<void> setItem(String key, String value) async {
		final normalized = normalizeStorageKey(key);
		if (value.length <= storageValueLimit) {
			await _inner.setItem(normalized, value);
			return;
		}
		await _inner.setItem(normalized, '');
		final count = (value.length / storageValueLimit).ceil();
		for (var i = 0; i < count; i++) {
			final start = i * storageValueLimit;
			final end = (start + storageValueLimit).clamp(0, value.length);
			await _inner.setItem('$normalized.$i', value.substring(start, end));
		}
		await _inner.setItem(normalized, '$chunkMarker$count');
	}

	@override
	Future<void> removeItem(String key) async {
		final normalized = normalizeStorageKey(key);
		final stored = await _inner.getItem(normalized);
		if (stored != null && stored.startsWith(chunkMarker)) {
			final count = int.tryParse(stored.substring(chunkMarker.length)) ?? 0;
			for (var i = 0; i < count; i++) {
				await _inner.removeItem('$normalized.$i');
			}
		}
		await _inner.removeItem(normalized);
	}
}

/// Returns true when [setCookieHeader] contains Better Auth session cookies.
bool hasBetterAuthCookies(
	String setCookieHeader, [
	Object cookiePrefix = 'better-auth',
]) {
	final cookies = parseSetCookieHeader(setCookieHeader);
	final prefixes = cookiePrefix is List<String>
			? cookiePrefix
			: [cookiePrefix as String];
	const suffixes = ['session_token', 'session_data'];

	for (final name in cookies.keys) {
		var nameWithoutSecure = name;
		if (nameWithoutSecure.startsWith('__Secure-')) {
			nameWithoutSecure = nameWithoutSecure.substring('__Secure-'.length);
		}
		for (final prefix in prefixes) {
			if (prefix.isNotEmpty) {
				if (nameWithoutSecure.startsWith(prefix)) return true;
			} else {
				for (final suffix in suffixes) {
					if (nameWithoutSecure.endsWith(suffix)) return true;
				}
			}
		}
	}
	return false;
}

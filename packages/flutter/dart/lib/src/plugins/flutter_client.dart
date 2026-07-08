import 'dart:convert';

import '../cookies.dart';
import '../storage.dart';

/// Opens an auth session in a browser / ASWebAuthenticationSession-style UI
/// and returns the final redirect URL on success.
///
/// Wire this to `flutter_web_auth_2`, Chrome Custom Tabs, or a custom flow.
typedef AuthSessionLauncher = Future<Uri?> Function({
	required Uri authorizationUrl,
	required Uri callbackUrl,
});

/// Options for [flutterClient].
final class FlutterClientOptions {
	const FlutterClientOptions({
		required this.scheme,
		required this.storage,
		this.storagePrefix = 'better-auth',
		this.cookiePrefix = 'better-auth',
		this.disableCache = false,
		this.sessionLauncher,
	});

	/// Custom URL scheme registered by the Flutter app (e.g. `myapp`).
	final String scheme;

	/// Injectable storage (typically secure storage on device).
	final AuthStorage storage;

	/// Prefix for local storage keys (cookie jar + session cache).
	final String storagePrefix;

	/// Prefix for server cookie names to filter Set-Cookie processing.
	final String cookiePrefix;

	/// When true, skip reading/writing the local session cache.
	final bool disableCache;

	/// Opens the OAuth / social browser session. Required for [AuthClient.signInSocial].
	final AuthSessionLauncher? sessionLauncher;

	String get origin => '$scheme://';
}

/// Client plugin that wires Flutter-specific cookie persistence and origin headers.
///
/// Mirrors `@better-auth/expo`'s `expoClient` contract:
/// - Sends `Cookie` + `flutter-origin` on every request
/// - Persists `Set-Cookie` values that belong to Better Auth
/// - Caches session payloads locally
/// - Handles OAuth proxy + deep-link cookie capture
final class FlutterClientPlugin {
	FlutterClientPlugin(this.options)
			: storage = ChunkedAuthStorage(options.storage);

	final FlutterClientOptions options;
	final AuthStorage storage;

	String get id => 'flutter';

	String get _cookieName => '${options.storagePrefix}_cookie';
	String get _sessionCacheName => '${options.storagePrefix}_session_data';

	Future<String> getCookie() async {
		final raw = await storage.getItem(_cookieName);
		return buildCookieHeader(raw ?? '{}');
	}

	Future<String?> getCookieJson() => storage.getItem(_cookieName);

	Future<void> clearSessionCache() async {
		await storage.setItem(_cookieName, '{}');
		await storage.setItem(_sessionCacheName, '{}');
	}

	/// Headers to attach to outgoing Better Auth requests.
	Future<Map<String, String>> requestHeaders() async {
		final cookie = await getCookie();
		return {
			if (cookie.isNotEmpty) 'cookie': cookie,
			'flutter-origin': options.origin,
			'x-skip-oauth-proxy': 'true',
		};
	}

	/// Convert a relative callback path into a deep link for this scheme.
	Uri resolveCallbackUrl(String callbackURL) {
		if (callbackURL.startsWith('http://') ||
				callbackURL.startsWith('https://') ||
				callbackURL.contains('://')) {
			return Uri.parse(callbackURL);
		}
		final path = callbackURL.startsWith('/') ? callbackURL : '/$callbackURL';
		// Match Expo Linking.createURL: `<scheme>:///<path>`
		return Uri.parse('${options.scheme}://$path');
	}

	/// Persist Set-Cookie from a successful response when relevant.
	Future<void> onResponse({
		required Uri url,
		required Map<String, String> headers,
		Object? body,
	}) async {
		final setCookie = headers['set-cookie'] ?? headers['Set-Cookie'];
		if (setCookie != null &&
				hasBetterAuthCookies(setCookie, options.cookiePrefix)) {
			final prev = await storage.getItem(_cookieName);
			final merged = mergeSetCookie(setCookie, prev);
			await storage.setItem(_cookieName, merged);
		}

		final path = url.path;
		if (!options.disableCache &&
				path.contains('/get-session') &&
				body != null) {
			await storage.setItem(
				_sessionCacheName,
				body is String ? body : '$body',
			);
		}
		if (path.contains('/sign-out')) {
			await clearSessionCache();
		}
	}

	Future<String?> readCachedSessionJson() async {
		if (options.disableCache) return null;
		return storage.getItem(_sessionCacheName);
	}

	Future<void> writeCachedSessionJson(String json) async {
		if (options.disableCache) return;
		await storage.setItem(_sessionCacheName, json);
	}

	/// Runs the OAuth authorization proxy flow and stores the returned cookie.
	///
	/// Returns `true` when a session cookie was captured from the redirect URL.
	Future<bool> completeSocialRedirect({
		required String signInUrl,
		required String authBaseUrl,
		required String callbackURL,
	}) async {
		final launcher = options.sessionLauncher;
		if (launcher == null) {
			throw StateError(
				'sessionLauncher is required for social sign-in. '
				'Pass an AuthSessionLauncher in FlutterClientOptions '
				'(e.g. flutter_web_auth_2).',
			);
		}

		final callbackUrl = resolveCallbackUrl(callbackURL);
		final cookieJson = await getCookieJson();
		final oauthState = getOAuthStateValue(cookieJson, options.cookiePrefix);

		final proxy = Uri.parse('$authBaseUrl/flutter-authorization-proxy')
				.replace(
			queryParameters: {
				'authorizationURL': signInUrl,
				if (oauthState != null) 'oauthState': oauthState,
			},
		);

		final resultUrl = await launcher(
			authorizationUrl: proxy,
			callbackUrl: callbackUrl,
		);
		if (resultUrl == null) return false;

		final cookieParam = resultUrl.queryParameters['cookie'];
		if (cookieParam == null || cookieParam.isEmpty) return false;

		final prev = await storage.getItem(_cookieName);
		final merged = mergeSetCookie(cookieParam, prev);
		await storage.setItem(_cookieName, merged);
		return true;
	}
}

/// Creates a [FlutterClientPlugin] with the given options.
FlutterClientPlugin flutterClient(FlutterClientOptions options) {
	if (options.scheme.trim().isEmpty) {
		throw ArgumentError(
			'Scheme is required. Provide the Flutter app deep-link scheme.',
		);
	}
	return FlutterClientPlugin(options);
}

/// Reads `oauth_state` from the stored cookie jar (Expo-compatible naming).
String? getOAuthStateValue(String? cookieJson, String cookiePrefix) {
	if (cookieJson == null || cookieJson.isEmpty) return null;
	Map<String, Object?> parsed;
	try {
		parsed = jsonDecode(cookieJson) as Map<String, Object?>? ?? {};
	} catch (_) {
		return null;
	}

	const securePrefix = '__Secure-';
	final candidates = [
		'$securePrefix$cookiePrefix.oauth_state',
		'$cookiePrefix.oauth_state',
	];
	for (final name in candidates) {
		final entry = parsed[name];
		if (entry is Map<String, Object?>) {
			final value = entry['value'] as String?;
			if (value != null && value.isNotEmpty) return value;
		}
	}
	return null;
}

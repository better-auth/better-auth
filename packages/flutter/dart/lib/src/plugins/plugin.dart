import '../models.dart';

/// Client-side plugin contract for the Dart Better Auth client.
///
/// Mirrors the conceptual surface of `BetterAuthClientPlugin` (headers,
/// response hooks, session refresh triggers) without TypeScript/nanostores.
abstract class AuthClientPlugin {
	String get id;

	/// Extra headers merged into every auth request.
	Future<Map<String, String>> buildRequestHeaders() async => const {};

	/// Called after each auth response is received.
	Future<void> handleResponse({
		required Uri url,
		required Map<String, String> headers,
		required int statusCode,
		Object? body,
	}) async {}

	/// When true, [AuthClient] refetches the session after this path succeeds.
	bool triggersSessionRefresh(String path) => false;

	/// Called once when the plugin is attached to an [AuthClient].
	void attach(Object client) {}
}

/// Narrow request surface plugins use to call Better Auth endpoints.
abstract interface class AuthRequestClient {
	Future<AuthResponse<Map<String, Object?>>> postJson(
		String path,
		Map<String, Object?> body, {
		bool refreshSession = false,
	});

	Future<AuthResponse<Map<String, Object?>>> getJson(
		String path, {
		Map<String, String>? query,
		bool refreshSession = false,
	});

	Future<void> refreshSession();
}

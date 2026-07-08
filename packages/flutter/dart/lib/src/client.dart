import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';
import 'plugins/flutter_client.dart';
import 'plugins/last_login_method.dart';
import 'plugins/organization.dart';
import 'plugins/plugin.dart';
import 'plugins/two_factor.dart';
import 'session_refresh.dart';

export 'session_refresh.dart' show SessionOptions;

/// Creates a Better Auth client for Dart / Flutter.
AuthClient createAuthClient({
	required String baseUrl,
	String basePath = '/api/auth',
	FlutterClientPlugin? plugin,
	List<AuthClientPlugin> plugins = const [],
	http.Client? httpClient,
	SessionOptions sessionOptions = const SessionOptions(),
	bool Function()? isOnline,
}) {
	return AuthClient(
		baseUrl: baseUrl,
		basePath: basePath,
		plugin: plugin,
		plugins: plugins,
		httpClient: httpClient,
		sessionOptions: sessionOptions,
		isOnline: isOnline,
	);
}

final class AuthClient implements AuthRequestClient {
	AuthClient({
		required this.baseUrl,
		this.basePath = '/api/auth',
		this.plugin,
		List<AuthClientPlugin> plugins = const [],
		http.Client? httpClient,
		SessionOptions sessionOptions = const SessionOptions(),
		bool Function()? isOnline,
	})  : _http = httpClient ?? http.Client(),
				_sessionOptions = sessionOptions,
				_isOnlineOverride = isOnline,
				_plugins = List<AuthClientPlugin>.unmodifiable(plugins) {
		_refresh = SessionRefreshManager(
			fetchSession: () async {
				await getSession();
			},
			options: sessionOptions,
			isOnline: () => this.isOnline,
		);
		_refresh.start();
		for (final p in _plugins) {
			p.attach(this);
		}
	}

	final String baseUrl;
	final String basePath;
	final FlutterClientPlugin? plugin;
	final List<AuthClientPlugin> _plugins;
	final http.Client _http;
	final SessionOptions _sessionOptions;
	final bool Function()? _isOnlineOverride;
	late final SessionRefreshManager _refresh;

	final _sessionController = StreamController<SessionData?>.broadcast();
	SessionData? _session;
	bool _isOnline = true;

	/// Current session snapshot (may be null).
	SessionData? get session => _session;

	/// Stream of session changes.
	Stream<SessionData?> get sessionStream => _sessionController.stream;

	SessionOptions get sessionOptions => _sessionOptions;

	List<AuthClientPlugin> get plugins => _plugins;

	/// Online state used by session refresh. Update via [setOnline].
	bool get isOnline => _isOnlineOverride?.call() ?? _isOnline;

	void setOnline(bool value) {
		_isOnline = value;
	}

	/// Call when the Flutter app returns to the foreground.
	void onAppResumed() => _refresh.onAppResumed();

	/// First plugin of type [T], if registered.
	T? pluginOf<T extends AuthClientPlugin>() {
		for (final p in _plugins) {
			if (p is T) return p;
		}
		return null;
	}

	OrganizationPlugin? get organization => pluginOf<OrganizationPlugin>();

	TwoFactorPlugin? get twoFactor => pluginOf<TwoFactorPlugin>();

	LastLoginMethodPlugin? get lastLoginMethod =>
			pluginOf<LastLoginMethodPlugin>();

	Uri get _authBase {
		final root = baseUrl.endsWith('/')
				? baseUrl.substring(0, baseUrl.length - 1)
				: baseUrl;
		final prefix = basePath.startsWith('/') ? basePath : '/$basePath';
		return Uri.parse('$root$prefix');
	}

	Uri _resolve(String path, [Map<String, String>? query]) {
		final suffix = path.startsWith('/') ? path : '/$path';
		final uri = Uri.parse('$_authBase$suffix');
		if (query == null || query.isEmpty) return uri;
		return uri.replace(queryParameters: {
			...uri.queryParameters,
			...query,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> signInEmail({
		required String email,
		required String password,
		bool rememberMe = true,
	}) {
		return postJson('/sign-in/email', {
			'email': email,
			'password': password,
			'rememberMe': rememberMe,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> signUpEmail({
		required String email,
		required String password,
		required String name,
	}) {
		return postJson('/sign-up/email', {
			'email': email,
			'password': password,
			'name': name,
		}, refreshSession: true);
	}

	/// Social / OAuth sign-in via the Flutter authorization proxy + session launcher.
	Future<AuthResponse<Map<String, Object?>>> signInSocial({
		required String provider,
		String callbackURL = '/',
		String? idToken,
		String? accessToken,
		Map<String, Object?>? extra,
	}) async {
		final body = <String, Object?>{
			'provider': provider,
			'callbackURL': callbackURL,
			if (idToken != null) 'idToken': idToken,
			if (accessToken != null) 'accessToken': accessToken,
			...?extra,
		};

		if (idToken != null || accessToken != null) {
			return postJson('/sign-in/social', body, refreshSession: true);
		}

		final flutterPlugin = plugin;
		if (flutterPlugin == null) {
			return const AuthResponse(
				error: AuthError(
					message:
							'flutterClient plugin is required for social browser sign-in',
				),
			);
		}

		final resolvedCallback =
				flutterPlugin.resolveCallbackUrl(callbackURL).toString();
		body['callbackURL'] = resolvedCallback;

		final result = await postJson('/sign-in/social', body);
		if (result.error != null) return result;

		final data = result.data ?? {};
		final redirect = data['redirect'] == true;
		final url = data['url'] as String?;
		if (!redirect || url == null || url.isEmpty) {
			await getSession();
			return result;
		}

		try {
			final captured = await flutterPlugin.completeSocialRedirect(
				signInUrl: url,
				authBaseUrl: _authBase.toString(),
				callbackURL: resolvedCallback,
			);
			if (captured) {
				await getSession();
			}
			return AuthResponse(
				data: {
					...data,
					'cookieCaptured': captured,
				},
			);
		} catch (e) {
			return AuthResponse(
				error: AuthError(message: e.toString(), raw: e),
			);
		}
	}

	Future<AuthResponse<void>> signOut() async {
		final result = await postJson('/sign-out', {});
		_setSession(null);
		await plugin?.clearSessionCache();
		if (result.error != null) {
			return AuthResponse(error: result.error);
		}
		return const AuthResponse();
	}

	Future<AuthResponse<SessionData?>> getSession() async {
		final uri = _resolve('/get-session');
		final headers = await _headers(json: false);
		final response = await _http.get(uri, headers: headers);
		await _notifyPlugins(uri, response);
		_refresh.markSessionFetched();

		if (response.statusCode >= 400) {
			return AuthResponse(error: _errorFromResponse(response));
		}
		if (response.body.isEmpty || response.body == 'null') {
			_setSession(null);
			return const AuthResponse(data: null);
		}
		try {
			final json =
					jsonDecode(response.body) as Map<String, Object?>? ?? {};
			if (json.isEmpty || json['session'] == null) {
				_setSession(null);
				return const AuthResponse(data: null);
			}
			final data = SessionData.fromJson(json);
			_setSession(data);
			return AuthResponse(data: data);
		} catch (e) {
			return AuthResponse(
				error: AuthError(message: 'Failed to parse session', raw: e),
			);
		}
	}

	/// Generates a one-time token for the current session.
	Future<AuthResponse<String>> generateOneTimeToken() async {
		final uri = _resolve('/one-time-token/generate');
		final headers = await _headers(json: false);
		final response = await _http.get(uri, headers: headers);
		await _notifyPlugins(uri, response);

		if (response.statusCode >= 400) {
			return AuthResponse(error: _errorFromResponse(response));
		}
		try {
			final json =
					jsonDecode(response.body) as Map<String, Object?>? ?? {};
			final token = json['token'] as String?;
			if (token == null || token.isEmpty) {
				return const AuthResponse(
					error: AuthError(message: 'Missing token in response'),
				);
			}
			return AuthResponse(data: token);
		} catch (e) {
			return AuthResponse(
				error: AuthError(message: 'Failed to parse token', raw: e),
			);
		}
	}

	/// Builds a session-handoff URL: `{targetUrl}?token=...`.
	Future<AuthResponse<Uri>> createSessionHandoffUrl({
		required String targetUrl,
		String tokenQueryParam = 'token',
	}) async {
		final tokenResult = await generateOneTimeToken();
		if (tokenResult.error != null || tokenResult.data == null) {
			return AuthResponse(error: tokenResult.error);
		}
		final base = Uri.parse(targetUrl);
		final handoff = base.replace(
			queryParameters: {
				...base.queryParameters,
				tokenQueryParam: tokenResult.data!,
			},
		);
		return AuthResponse(data: handoff);
	}

	/// Cookie header for your own authenticated API calls.
	Future<String> getCookie() async {
		return plugin?.getCookie() ?? '';
	}

	@override
	Future<void> refreshSession() async {
		await getSession();
	}

	@override
	Future<AuthResponse<Map<String, Object?>>> postJson(
		String path,
		Map<String, Object?> body, {
		bool refreshSession = false,
	}) async {
		final uri = _resolve(path);
		final headers = await _headers(json: true);
		final response = await _http.post(
			uri,
			headers: headers,
			body: jsonEncode(body),
		);
		await _notifyPlugins(uri, response);

		if (response.statusCode >= 400) {
			return AuthResponse(error: _errorFromResponse(response));
		}

		final data = _decodeMap(response.body);
		final shouldRefresh = refreshSession ||
				_plugins.any((p) => p.triggersSessionRefresh(path));
		if (shouldRefresh) {
			await getSession();
		}

		return AuthResponse(data: data);
	}

	@override
	Future<AuthResponse<Map<String, Object?>>> getJson(
		String path, {
		Map<String, String>? query,
		bool refreshSession = false,
	}) async {
		final uri = _resolve(path, query);
		final headers = await _headers(json: false);
		final response = await _http.get(uri, headers: headers);
		await _notifyPlugins(uri, response);

		if (response.statusCode >= 400) {
			return AuthResponse(error: _errorFromResponse(response));
		}

		final data = _decodeMap(response.body);
		final shouldRefresh = refreshSession ||
				_plugins.any((p) => p.triggersSessionRefresh(path));
		if (shouldRefresh) {
			await getSession();
		}
		return AuthResponse(data: data);
	}

	Map<String, Object?> _decodeMap(String body) {
		if (body.isEmpty) return {};
		try {
			final decoded = jsonDecode(body);
			if (decoded is Map<String, Object?>) return decoded;
			if (decoded is Map) return decoded.cast<String, Object?>();
		} catch (_) {
			return {'raw': body};
		}
		return {};
	}

	Future<Map<String, String>> _headers({required bool json}) async {
		final headers = <String, String>{
			if (json) 'content-type': 'application/json',
			'accept': 'application/json',
		};
		if (plugin != null) {
			headers.addAll(await plugin!.requestHeaders());
		}
		for (final p in _plugins) {
			headers.addAll(await p.buildRequestHeaders());
		}
		return headers;
	}

	Future<void> _notifyPlugins(Uri uri, http.Response response) async {
		final headers = <String, String>{};
		response.headers.forEach((key, value) {
			headers[key.toLowerCase()] = value;
		});

		Object? body = response.body;
		try {
			body = jsonDecode(response.body);
		} catch (_) {}

		if (plugin != null) {
			await plugin!.onResponse(
				url: uri,
				headers: headers,
				body: response.body,
			);
		}
		for (final p in _plugins) {
			await p.handleResponse(
				url: uri,
				headers: headers,
				statusCode: response.statusCode,
				body: body,
			);
		}
	}

	AuthError _errorFromResponse(http.Response response) {
		String message = response.reasonPhrase ?? 'Request failed';
		String? code;
		try {
			final decoded = jsonDecode(response.body);
			if (decoded is Map) {
				message = decoded['message'] as String? ??
						decoded['error'] as String? ??
						message;
				code = decoded['code'] as String?;
			}
		} catch (_) {}
		return AuthError(
			message: message,
			code: code,
			status: response.statusCode,
			raw: response.body,
		);
	}

	void _setSession(SessionData? data) {
		_session = data;
		if (!_sessionController.isClosed) {
			_sessionController.add(data);
		}
	}

	Future<void> dispose() async {
		_refresh.stop();
		await _sessionController.close();
		_http.close();
	}
}

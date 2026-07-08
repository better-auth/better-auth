import '../models.dart';
import 'plugin.dart';

/// Options for [twoFactorClient].
final class TwoFactorClientOptions {
	const TwoFactorClientOptions({this.onTwoFactorRedirect});

	/// Called when sign-in indicates a 2FA challenge is required.
	final Future<void> Function({List<String>? twoFactorMethods})?
			onTwoFactorRedirect;
}

/// Client helpers for the server [twoFactor] plugin.
final class TwoFactorPlugin extends AuthClientPlugin {
	TwoFactorPlugin({this.options = const TwoFactorClientOptions()});

	final TwoFactorClientOptions options;
	AuthRequestClient? _client;

	@override
	String get id => 'two-factor';

	@override
	void attach(Object client) {
		if (client is AuthRequestClient) {
			_client = client;
		}
	}

	AuthRequestClient get _req {
		final client = _client;
		if (client == null) {
			throw StateError('twoFactorClient is not attached to an AuthClient');
		}
		return client;
	}

	@override
	bool triggersSessionRefresh(String path) => path.startsWith('/two-factor/');

	@override
	Future<void> handleResponse({
		required Uri url,
		required Map<String, String> headers,
		required int statusCode,
		Object? body,
	}) async {
		if (statusCode >= 400) return;
		Map<String, Object?>? data;
		if (body is Map<String, Object?>) {
			data = body;
		} else if (body is Map) {
			data = body.cast<String, Object?>();
		}
		if (data?['twoFactorRedirect'] != true) return;
		final callback = options.onTwoFactorRedirect;
		if (callback == null) return;
		final methodsRaw = data?['twoFactorMethods'];
		List<String>? methods;
		if (methodsRaw is List) {
			methods = methodsRaw.map((e) => e.toString()).toList();
		}
		await callback(twoFactorMethods: methods);
	}

	Future<AuthResponse<Map<String, Object?>>> enable({
		required String password,
		String? issuer,
	}) {
		return _req.postJson('/two-factor/enable', {
			'password': password,
			if (issuer != null) 'issuer': issuer,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> disable({
		required String password,
	}) {
		return _req.postJson('/two-factor/disable', {'password': password});
	}

	Future<AuthResponse<Map<String, Object?>>> getTotpUri({
		required String password,
	}) {
		return _req.postJson('/two-factor/get-totp-uri', {'password': password});
	}

	Future<AuthResponse<Map<String, Object?>>> verifyTotp({
		required String code,
		bool? trustDevice,
	}) {
		return _req.postJson('/two-factor/verify-totp', {
			'code': code,
			if (trustDevice != null) 'trustDevice': trustDevice,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> sendOtp() {
		return _req.postJson('/two-factor/send-otp', {});
	}

	Future<AuthResponse<Map<String, Object?>>> verifyOtp({
		required String code,
		bool? trustDevice,
	}) {
		return _req.postJson('/two-factor/verify-otp', {
			'code': code,
			if (trustDevice != null) 'trustDevice': trustDevice,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> verifyBackupCode({
		required String code,
		bool? trustDevice,
		bool? disableSession,
	}) {
		return _req.postJson('/two-factor/verify-backup-code', {
			'code': code,
			if (trustDevice != null) 'trustDevice': trustDevice,
			if (disableSession != null) 'disableSession': disableSession,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> generateBackupCodes({
		required String password,
	}) {
		return _req.postJson('/two-factor/generate-backup-codes', {
			'password': password,
		});
	}
}

TwoFactorPlugin twoFactorClient([TwoFactorClientOptions? options]) {
	return TwoFactorPlugin(options: options ?? const TwoFactorClientOptions());
}

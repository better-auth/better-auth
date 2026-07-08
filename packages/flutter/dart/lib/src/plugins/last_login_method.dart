import '../storage.dart';
import 'plugin.dart';

/// Options for [lastLoginMethodClient].
final class LastLoginMethodOptions {
	const LastLoginMethodOptions({
		required this.storage,
		this.storagePrefix = 'better-auth',
		this.resolveMethod,
	});

	final AuthStorage storage;
	final String storagePrefix;

	/// Override how a request URL maps to a login-method label.
	final String? Function(Uri url)? resolveMethod;
}

/// Persists the last successful login method (email, google, passkey, …).
final class LastLoginMethodPlugin extends AuthClientPlugin {
	LastLoginMethodPlugin(this.options);

	final LastLoginMethodOptions options;

	@override
	String get id => 'last-login-method';

	String get _key => '${options.storagePrefix}_last_login_method';

	static const _tracked = [
		'/callback/',
		'/oauth2/callback/',
		'/sign-in/email',
		'/sign-up/email',
	];

	String? _defaultResolve(Uri url) {
		final path = url.path;
		if (_tracked.any(path.contains)) {
			final segments = path.split('/').where((s) => s.isNotEmpty);
			return segments.isEmpty ? null : segments.last;
		}
		if (path.contains('siwe')) return 'siwe';
		if (path.contains('/passkey/verify-authentication')) return 'passkey';
		if (path.contains('/sign-in/social')) return 'social';
		return null;
	}

	@override
	Future<void> handleResponse({
		required Uri url,
		required Map<String, String> headers,
		required int statusCode,
		Object? body,
	}) async {
		if (statusCode >= 400) return;
		final resolve = options.resolveMethod ?? _defaultResolve;
		final method = resolve(url);
		if (method == null || method.isEmpty) return;
		await options.storage.setItem(_key, method);
	}

	Future<String?> getLastUsedLoginMethod() => options.storage.getItem(_key);

	Future<void> clearLastUsedLoginMethod() => options.storage.removeItem(_key);

	Future<bool> isLastUsedLoginMethod(String method) async {
		final last = await getLastUsedLoginMethod();
		return last == method;
	}
}

LastLoginMethodPlugin lastLoginMethodClient(LastLoginMethodOptions options) {
	return LastLoginMethodPlugin(options);
}

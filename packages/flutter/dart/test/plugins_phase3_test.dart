import 'dart:convert';

import 'package:better_auth/better_auth.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
	group('lastLoginMethodClient', () {
		test('stores method after successful sign-in', () async {
			final memory = MemoryAuthStorage();
			final lastLogin = lastLoginMethodClient(
				LastLoginMethodOptions(storage: memory, storagePrefix: 'myapp'),
			);
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				plugins: [lastLogin],
				httpClient: MockClient((request) async {
					if (request.url.path.endsWith('/sign-in/email')) {
						return http.Response(
							jsonEncode({'token': 'ok'}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response('null', 200);
					}
					return http.Response('no', 404);
				}),
			);

			await client.signInEmail(email: 'a@b.c', password: 'x');
			expect(await lastLogin.getLastUsedLoginMethod(), 'email');
			expect(await lastLogin.isLastUsedLoginMethod('email'), isTrue);
			await lastLogin.clearLastUsedLoginMethod();
			expect(await lastLogin.getLastUsedLoginMethod(), isNull);
			await client.dispose();
		});
	});

	group('organizationClient', () {
		test('list and create call expected endpoints', () async {
			final paths = <String>[];
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				plugins: [organizationClient()],
				httpClient: MockClient((request) async {
					paths.add('${request.method} ${request.url.path}');
					if (request.url.path.endsWith('/organization/list')) {
						return http.Response(
							jsonEncode([
								{'id': 'org_1', 'name': 'Acme', 'slug': 'acme'},
							]),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/organization/create')) {
						return http.Response(
							jsonEncode({'id': 'org_1', 'name': 'Acme', 'slug': 'acme'}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response('null', 200);
					}
					return http.Response('no', 404);
				}),
			);

			final list = await client.organization!.list();
			expect(list.error, isNull);

			final created = await client.organization!.create(
				name: 'Acme',
				slug: 'acme',
			);
			expect(created.error, isNull);
			expect(paths, contains('GET /api/auth/organization/list'));
			expect(paths, contains('POST /api/auth/organization/create'));
			await client.dispose();
		});
	});

	group('twoFactorClient', () {
		test('invokes onTwoFactorRedirect', () async {
			var redirected = false;
			List<String>? methods;
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				plugins: [
					twoFactorClient(
						TwoFactorClientOptions(
							onTwoFactorRedirect: ({twoFactorMethods}) async {
								redirected = true;
								methods = twoFactorMethods;
							},
						),
					),
				],
				httpClient: MockClient((request) async {
					if (request.url.path.endsWith('/sign-in/email')) {
						return http.Response(
							jsonEncode({
								'twoFactorRedirect': true,
								'twoFactorMethods': ['totp', 'otp'],
							}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response('null', 200);
					}
					return http.Response('no', 404);
				}),
			);

			await client.signInEmail(email: 'a@b.c', password: 'x');
			expect(redirected, isTrue);
			expect(methods, ['totp', 'otp']);

			final verifyPath = <String>[];
			final client2 = createAuthClient(
				baseUrl: 'http://localhost',
				plugins: [twoFactorClient()],
				httpClient: MockClient((request) async {
					verifyPath.add(request.url.path);
					if (request.url.path.endsWith('/two-factor/verify-totp')) {
						return http.Response(
							jsonEncode({'status': true}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response('null', 200);
					}
					return http.Response('no', 404);
				}),
			);
			await client2.twoFactor!.verifyTotp(code: '123456');
			expect(verifyPath, contains('/api/auth/two-factor/verify-totp'));
			await client.dispose();
			await client2.dispose();
		});
	});
}

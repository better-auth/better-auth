import 'dart:convert';

import 'package:better_auth/better_auth.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
	group('cookies (phase 1)', () {
		test('parses and merges set-cookie', () {
			final merged = mergeSetCookie(
				'better-auth.session_token=abc123; Max-Age=3600',
			);
			expect(
				buildCookieHeader(merged),
				contains('better-auth.session_token=abc123'),
			);
		});

		test('chunked storage round-trip', () async {
			final memory = MemoryAuthStorage();
			final storage = ChunkedAuthStorage(memory);
			final value = 'x' * (storageValueLimit * 2 + 50);
			await storage.setItem('better-auth_cookie', value);
			expect(await storage.getItem('better-auth_cookie'), value);
		});
	});

	group('flutterClient social helpers', () {
		test('resolveCallbackUrl builds deep links', () {
			final plugin = flutterClient(
				FlutterClientOptions(
					scheme: 'myapp',
					storage: MemoryAuthStorage(),
				),
			);
			expect(
				plugin.resolveCallbackUrl('/dashboard').toString(),
				'myapp:///dashboard',
			);
			expect(
				plugin.resolveCallbackUrl('https://example.com/cb').toString(),
				'https://example.com/cb',
			);
		});

		test('completeSocialRedirect stores cookie from callback', () async {
			final memory = MemoryAuthStorage();
			final plugin = flutterClient(
				FlutterClientOptions(
					scheme: 'myapp',
					storage: memory,
					sessionLauncher: ({
						required authorizationUrl,
						required callbackUrl,
					}) async {
						expect(
							authorizationUrl.path,
							contains('flutter-authorization-proxy'),
						);
						expect(
							authorizationUrl.queryParameters['authorizationURL'],
							'https://accounts.google.com/o/oauth2',
						);
						return Uri.parse(
							'myapp:///dashboard?cookie=${Uri.encodeComponent('better-auth.session_token=tok; Max-Age=3600')}',
						);
					},
				),
			);

			final ok = await plugin.completeSocialRedirect(
				signInUrl: 'https://accounts.google.com/o/oauth2',
				authBaseUrl: 'http://localhost/api/auth',
				callbackURL: '/dashboard',
			);
			expect(ok, isTrue);
			expect(await plugin.getCookie(), contains('session_token=tok'));
		});

		test('getOAuthStateValue reads stored oauth_state', () {
			final json = jsonEncode({
				'better-auth.oauth_state': {
					'value': 'state-123',
					'expires': null,
				},
			});
			expect(getOAuthStateValue(json, 'better-auth'), 'state-123');
		});
	});

	group('AuthClient social + OTT', () {
		test('signInSocial with idToken skips browser launcher', () async {
			var posts = 0;
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				httpClient: MockClient((request) async {
					if (request.url.path.endsWith('/sign-in/social')) {
						posts++;
						return http.Response(
							jsonEncode({
								'user': {'id': '1', 'email': 'a@b.c', 'name': 'A'},
								'session': {
									'id': 's',
									'userId': '1',
									'token': 't',
									'expiresAt': DateTime.now()
											.add(const Duration(hours: 1))
											.toUtc()
											.toIso8601String(),
								},
							}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response(
							jsonEncode({
								'user': {'id': '1', 'email': 'a@b.c', 'name': 'A'},
								'session': {
									'id': 's',
									'userId': '1',
									'token': 't',
									'expiresAt': DateTime.now()
											.add(const Duration(hours: 1))
											.toUtc()
											.toIso8601String(),
								},
							}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					return http.Response('not found', 404);
				}),
				plugin: flutterClient(
					FlutterClientOptions(
						scheme: 'myapp',
						storage: MemoryAuthStorage(),
						sessionLauncher: ({
							required authorizationUrl,
							required callbackUrl,
						}) async {
							fail('launcher should not run for idToken flow');
						},
					),
				),
			);

			final res = await client.signInSocial(
				provider: 'google',
				idToken: 'jwt-here',
			);
			expect(res.error, isNull);
			expect(posts, 1);
			await client.dispose();
		});

		test('signInSocial opens proxy and captures cookie', () async {
			final memory = MemoryAuthStorage();
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				httpClient: MockClient((request) async {
					if (request.url.path.endsWith('/sign-in/social')) {
						return http.Response(
							jsonEncode({
								'redirect': true,
								'url': 'https://accounts.google.com/o/oauth2',
							}),
							200,
							headers: {
								'content-type': 'application/json',
								'set-cookie':
										'better-auth.oauth_state=abc; Max-Age=600',
							},
						);
					}
					if (request.url.path.endsWith('/get-session')) {
						return http.Response(
							jsonEncode({
								'user': {
									'id': '1',
									'email': 'a@b.c',
									'name': 'A',
								},
								'session': {
									'id': 's',
									'userId': '1',
									'token': 't',
									'expiresAt': DateTime.now()
											.add(const Duration(hours: 1))
											.toUtc()
											.toIso8601String(),
								},
							}),
							200,
							headers: {'content-type': 'application/json'},
						);
					}
					return http.Response('not found', 404);
				}),
				plugin: flutterClient(
					FlutterClientOptions(
						scheme: 'myapp',
						storage: memory,
						sessionLauncher: ({
							required authorizationUrl,
							required callbackUrl,
						}) async {
							expect(
								authorizationUrl.queryParameters['oauthState'],
								'abc',
							);
							return Uri.parse(
								'myapp:///dashboard?cookie=better-auth.session_token%3Dxyz%3B%20Max-Age%3D3600',
							);
						},
					),
				),
			);

			final res = await client.signInSocial(
				provider: 'google',
				callbackURL: '/dashboard',
			);
			expect(res.error, isNull);
			expect(res.data?['cookieCaptured'], isTrue);
			expect(await client.getCookie(), contains('session_token=xyz'));
			expect(client.session?.user.email, 'a@b.c');
			await client.dispose();
		});

		test('createSessionHandoffUrl appends token', () async {
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				httpClient: MockClient((request) async {
					expect(
						request.url.path.endsWith('/one-time-token/generate'),
						isTrue,
					);
					return http.Response(
						jsonEncode({'token': 'ott-secret'}),
						200,
						headers: {'content-type': 'application/json'},
					);
				}),
				plugin: flutterClient(
					FlutterClientOptions(
						scheme: 'myapp',
						storage: MemoryAuthStorage(),
					),
				),
			);

			final res = await client.createSessionHandoffUrl(
				targetUrl: 'https://app.example.com/auth/handoff',
			);
			expect(res.error, isNull);
			expect(
				res.data.toString(),
				'https://app.example.com/auth/handoff?token=ott-secret',
			);
			await client.dispose();
		});
	});

	group('session refresh', () {
		test('onAppResumed triggers getSession', () async {
			var gets = 0;
			final client = createAuthClient(
				baseUrl: 'http://localhost',
				sessionOptions: const SessionOptions(refetchOnAppResume: true),
				httpClient: MockClient((request) async {
					if (request.url.path.endsWith('/get-session')) {
						gets++;
						return http.Response('null', 200);
					}
					return http.Response('no', 404);
				}),
			);

			// First call may be rate-limited against epoch — force mark old.
			client.onAppResumed();
			await Future<void>.delayed(const Duration(milliseconds: 20));
			expect(gets, greaterThanOrEqualTo(1));
			await client.dispose();
		});
	});
}

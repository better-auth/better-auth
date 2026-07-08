/// User returned by Better Auth session endpoints.
final class User {
	const User({
		required this.id,
		required this.email,
		required this.name,
		this.emailVerified = false,
		this.image,
		this.createdAt,
		this.updatedAt,
		this.extra = const {},
	});

	final String id;
	final String email;
	final String name;
	final bool emailVerified;
	final String? image;
	final DateTime? createdAt;
	final DateTime? updatedAt;
	final Map<String, Object?> extra;

	factory User.fromJson(Map<String, Object?> json) {
		final known = {
			'id',
			'email',
			'name',
			'emailVerified',
			'image',
			'createdAt',
			'updatedAt',
		};
		return User(
			id: json['id'] as String? ?? '',
			email: json['email'] as String? ?? '',
			name: json['name'] as String? ?? '',
			emailVerified: json['emailVerified'] as bool? ?? false,
			image: json['image'] as String?,
			createdAt: _parseDate(json['createdAt']),
			updatedAt: _parseDate(json['updatedAt']),
			extra: {
				for (final e in json.entries)
					if (!known.contains(e.key)) e.key: e.value,
			},
		);
	}

	Map<String, Object?> toJson() => {
				'id': id,
				'email': email,
				'name': name,
				'emailVerified': emailVerified,
				if (image != null) 'image': image,
				if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
				if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
				...extra,
			};
}

/// Session returned by Better Auth session endpoints.
final class Session {
	const Session({
		required this.id,
		required this.userId,
		required this.token,
		required this.expiresAt,
		this.ipAddress,
		this.userAgent,
		this.createdAt,
		this.updatedAt,
		this.extra = const {},
	});

	final String id;
	final String userId;
	final String token;
	final DateTime expiresAt;
	final String? ipAddress;
	final String? userAgent;
	final DateTime? createdAt;
	final DateTime? updatedAt;
	final Map<String, Object?> extra;

	factory Session.fromJson(Map<String, Object?> json) {
		final known = {
			'id',
			'userId',
			'token',
			'expiresAt',
			'ipAddress',
			'userAgent',
			'createdAt',
			'updatedAt',
		};
		return Session(
			id: json['id'] as String? ?? '',
			userId: json['userId'] as String? ?? '',
			token: json['token'] as String? ?? '',
			expiresAt: _parseDate(json['expiresAt']) ??
					DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
			ipAddress: json['ipAddress'] as String?,
			userAgent: json['userAgent'] as String?,
			createdAt: _parseDate(json['createdAt']),
			updatedAt: _parseDate(json['updatedAt']),
			extra: {
				for (final e in json.entries)
					if (!known.contains(e.key)) e.key: e.value,
			},
		);
	}

	Map<String, Object?> toJson() => {
				'id': id,
				'userId': userId,
				'token': token,
				'expiresAt': expiresAt.toIso8601String(),
				if (ipAddress != null) 'ipAddress': ipAddress,
				if (userAgent != null) 'userAgent': userAgent,
				if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
				if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
				...extra,
			};
}

/// Combined session + user payload from `/get-session`.
final class SessionData {
	const SessionData({required this.session, required this.user});

	final Session session;
	final User user;

	factory SessionData.fromJson(Map<String, Object?> json) {
		return SessionData(
			session: Session.fromJson(
				(json['session'] as Map?)?.cast<String, Object?>() ?? {},
			),
			user: User.fromJson(
				(json['user'] as Map?)?.cast<String, Object?>() ?? {},
			),
		);
	}

	Map<String, Object?> toJson() => {
				'session': session.toJson(),
				'user': user.toJson(),
			};
}

/// Result wrapper that mirrors the Better Auth client `{ data, error }` shape.
final class AuthResponse<T> {
	const AuthResponse({this.data, this.error});

	final T? data;
	final AuthError? error;

	bool get isSuccess => error == null;
}

final class AuthError {
	const AuthError({
		required this.message,
		this.code,
		this.status,
		this.raw,
	});

	final String message;
	final String? code;
	final int? status;
	final Object? raw;

	@override
	String toString() => 'AuthError($status $code: $message)';
}

DateTime? _parseDate(Object? value) {
	if (value == null) return null;
	if (value is DateTime) return value.toUtc();
	if (value is String) return DateTime.tryParse(value)?.toUtc();
	if (value is int) {
		return DateTime.fromMillisecondsSinceEpoch(value, isUtc: true);
	}
	return null;
}

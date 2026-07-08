import '../models.dart';
import 'plugin.dart';

/// Client helpers for the server [organization] plugin.
final class OrganizationPlugin extends AuthClientPlugin {
	AuthRequestClient? _client;

	@override
	String get id => 'organization';

	@override
	void attach(Object client) {
		if (client is AuthRequestClient) {
			_client = client;
		}
	}

	AuthRequestClient get _req {
		final client = _client;
		if (client == null) {
			throw StateError('organizationClient is not attached to an AuthClient');
		}
		return client;
	}

	@override
	bool triggersSessionRefresh(String path) {
		return path == '/organization/set-active' ||
				path == '/organization/create' ||
				path == '/organization/delete' ||
				path == '/organization/remove-member' ||
				path == '/organization/leave' ||
				path == '/organization/accept-invitation';
	}

	Future<AuthResponse<Map<String, Object?>>> create({
		required String name,
		required String slug,
		String? logo,
		Map<String, Object?>? metadata,
		bool? keepCurrentActiveOrganization,
	}) {
		return _req.postJson('/organization/create', {
			'name': name,
			'slug': slug,
			if (logo != null) 'logo': logo,
			if (metadata != null) 'metadata': metadata,
			if (keepCurrentActiveOrganization != null)
				'keepCurrentActiveOrganization': keepCurrentActiveOrganization,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> list() {
		return _req.getJson('/organization/list');
	}

	Future<AuthResponse<Map<String, Object?>>> setActive({
		String? organizationId,
		String? organizationSlug,
	}) {
		return _req.postJson('/organization/set-active', {
			if (organizationId != null) 'organizationId': organizationId,
			if (organizationSlug != null) 'organizationSlug': organizationSlug,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> getFullOrganization({
		String? organizationId,
		String? organizationSlug,
	}) {
		return _req.getJson('/organization/get-full-organization', query: {
			if (organizationId != null) 'organizationId': organizationId,
			if (organizationSlug != null) 'organizationSlug': organizationSlug,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> updateOrganization({
		required Map<String, Object?> data,
		String? organizationId,
	}) {
		return _req.postJson('/organization/update', {
			'data': data,
			if (organizationId != null) 'organizationId': organizationId,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> delete({
		required String organizationId,
	}) {
		return _req.postJson('/organization/delete', {
			'organizationId': organizationId,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> checkSlug({required String slug}) {
		return _req.postJson('/organization/check-slug', {'slug': slug});
	}

	Future<AuthResponse<Map<String, Object?>>> inviteMember({
		required String email,
		required String role,
		String? organizationId,
		String? resend,
	}) {
		return _req.postJson('/organization/invite-member', {
			'email': email,
			'role': role,
			if (organizationId != null) 'organizationId': organizationId,
			if (resend != null) 'resend': resend,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> acceptInvitation({
		required String invitationId,
	}) {
		return _req.postJson('/organization/accept-invitation', {
			'invitationId': invitationId,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> rejectInvitation({
		required String invitationId,
	}) {
		return _req.postJson('/organization/reject-invitation', {
			'invitationId': invitationId,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> cancelInvitation({
		required String invitationId,
	}) {
		return _req.postJson('/organization/cancel-invitation', {
			'invitationId': invitationId,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> getActiveMember() {
		return _req.getJson('/organization/get-active-member');
	}

	Future<AuthResponse<Map<String, Object?>>> getActiveMemberRole() {
		return _req.getJson('/organization/get-active-member-role');
	}

	Future<AuthResponse<Map<String, Object?>>> leave({
		required String organizationId,
	}) {
		return _req.postJson('/organization/leave', {
			'organizationId': organizationId,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> removeMember({
		required String memberIdOrEmail,
		String? organizationId,
	}) {
		return _req.postJson('/organization/remove-member', {
			'memberIdOrEmail': memberIdOrEmail,
			if (organizationId != null) 'organizationId': organizationId,
		}, refreshSession: true);
	}

	Future<AuthResponse<Map<String, Object?>>> updateMemberRole({
		required String role,
		required String memberId,
		String? organizationId,
	}) {
		return _req.postJson('/organization/update-member-role', {
			'role': role,
			'memberId': memberId,
			if (organizationId != null) 'organizationId': organizationId,
		});
	}

	Future<AuthResponse<Map<String, Object?>>> listMembers({
		String? organizationId,
		String? limit,
		String? offset,
	}) {
		return _req.getJson('/organization/list-members', query: {
			if (organizationId != null) 'organizationId': organizationId,
			if (limit != null) 'limit': limit,
			if (offset != null) 'offset': offset,
		});
	}
}

OrganizationPlugin organizationClient() => OrganizationPlugin();

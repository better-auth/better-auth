/// Injectable key/value storage used by the Flutter client plugin.
///
/// Pass any backend (`flutter_secure_storage`, Hive, in-memory Map, etc.).
abstract interface class AuthStorage {
	Future<String?> getItem(String key);
	Future<void> setItem(String key, String value);
	Future<void> removeItem(String key);
}

/// Simple in-memory [AuthStorage] useful for tests and ephemeral sessions.
final class MemoryAuthStorage implements AuthStorage {
	final Map<String, String> _store = {};

	@override
	Future<String?> getItem(String key) async => _store[key];

	@override
	Future<void> setItem(String key, String value) async {
		_store[key] = value;
	}

	@override
	Future<void> removeItem(String key) async {
		_store.remove(key);
	}

	void clear() => _store.clear();

	Map<String, String> get snapshot => Map.unmodifiable(_store);
}

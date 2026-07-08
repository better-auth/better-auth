import 'dart:async';

/// Options controlling automatic / manual session refetch.
final class SessionOptions {
	const SessionOptions({
		this.refetchInterval = Duration.zero,
		this.refetchOnAppResume = true,
		this.refetchWhenOffline = false,
	});

	/// Poll `/get-session` on this interval. [Duration.zero] disables polling.
	final Duration refetchInterval;

	/// Refetch when [AuthClient.onAppResumed] is called (app foreground).
	final bool refetchOnAppResume;

	/// When false (default), skip refetch while [AuthClient.isOnline] is false.
	final bool refetchWhenOffline;
}

/// Manages interval polling and resume-triggered session refresh.
final class SessionRefreshManager {
	SessionRefreshManager({
		required this.fetchSession,
		required this.options,
		this.isOnline = _alwaysOnline,
	});

	final Future<void> Function() fetchSession;
	final SessionOptions options;
	final bool Function() isOnline;

	static bool _alwaysOnline() => true;

	static const _focusRateLimit = Duration(seconds: 5);

	DateTime _lastSessionRequest =
			DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
	Timer? _pollTimer;

	/// Starts periodic polling when [SessionOptions.refetchInterval] is set.
	void start() {
		stop();
		final interval = options.refetchInterval;
		if (interval <= Duration.zero) return;
		_pollTimer = Timer.periodic(interval, (_) {
			if (!_shouldRefetch()) return;
			_lastSessionRequest = DateTime.now().toUtc();
			unawaited(fetchSession());
		});
	}

	void stop() {
		_pollTimer?.cancel();
		_pollTimer = null;
	}

	/// Call when the Flutter app returns to the foreground.
	void onAppResumed() {
		if (!options.refetchOnAppResume) return;
		if (!_shouldRefetch()) return;
		final since = DateTime.now().toUtc().difference(_lastSessionRequest);
		if (since < _focusRateLimit) return;
		_lastSessionRequest = DateTime.now().toUtc();
		unawaited(fetchSession());
	}

	/// Marks that a session request just completed (rate-limit bookkeeping).
	void markSessionFetched() {
		_lastSessionRequest = DateTime.now().toUtc();
	}

	bool _shouldRefetch() => options.refetchWhenOffline || isOnline();
}

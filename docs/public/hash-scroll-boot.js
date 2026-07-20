// Prevent browser scroll restoration from winning over URL hashes on reload.
if (location.hash && "scrollRestoration" in history) {
	history.scrollRestoration = "manual";
}

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center h-dvh bg-background text-foreground">
			<div className="flex items-center gap-4">
				<h1 className="text-2xl font-mono font-semibold">404</h1>
				<div className="h-8 w-px bg-foreground/20" />
				<p className="text-sm text-foreground/70">
					This page could not be found.
				</p>
			</div>
		</div>
	);
}

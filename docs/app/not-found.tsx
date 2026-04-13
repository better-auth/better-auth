import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="min-h-dvh pt-(--landing-topbar-height)">
			<div className="relative flex min-h-[calc(100dvh-var(--landing-topbar-height))] flex-col items-center justify-center px-6 text-center space-y-4">
				<h1 className="text-7xl font-light font-mono">404</h1>
				<p className="text-base font-mono">{"This page could not be found."}</p>
				<div className="pt-4">
					<Button>Back to Home</Button>
				</div>
			</div>
		</div>
	);
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Home() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-muted">
			<div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
				<div className="text-center">
					<h1 className="text-4xl font-extrabold text-foreground sm:text-5xl md:text-6xl">
						Better Auth
						<span className="block text-primary">UI Demo</span>
					</h1>
					<p className="mt-6 max-w-2xl mx-auto text-xl text-muted-foreground">
						Demonstrating the embedded{" "}
						<code className="bg-muted px-2 py-1 rounded text-lg">
							{"<Auth />"}
						</code>{" "}
						component for seamless authentication integration.
					</p>

					<div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
						<Button asChild size="lg">
							<Link href="/login">Sign In</Link>
						</Button>
						<Button asChild variant="outline" size="lg">
							<Link href="/register">Create Account</Link>
						</Button>
					</div>
				</div>

				<div className="mt-20 grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-2">
								<svg
									className="w-6 h-6 text-primary"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
									/>
								</svg>
							</div>
							<CardTitle>Embedded Components</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Embed pre-built auth UI directly in your pages using the{" "}
								<code className="bg-muted px-1 rounded">{"<Auth />"}</code>{" "}
								component. Works with React, Vue, Svelte, and Solid.
							</CardDescription>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-2">
								<svg
									className="w-6 h-6 text-purple-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
									/>
								</svg>
							</div>
							<CardTitle>Automatic Theming</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								The component automatically detects and inherits your shadcn/ui
								theme. No manual configuration required.
							</CardDescription>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-2">
								<svg
									className="w-6 h-6 text-green-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
							</div>
							<CardTitle>Automatic State Sync</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Session state automatically syncs between the embedded component
								and your app. No manual refresh needed after auth actions.
							</CardDescription>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<div className="w-12 h-12 bg-orange-500/10 rounded-lg flex items-center justify-center mb-2">
								<svg
									className="w-6 h-6 text-orange-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M13 10V3L4 14h7v7l9-11h-7z"
									/>
								</svg>
							</div>
							<CardTitle>Event Callbacks</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Handle auth events with{" "}
								<code className="bg-muted px-1 rounded">onSuccess</code>,{" "}
								<code className="bg-muted px-1 rounded">onError</code>, and{" "}
								<code className="bg-muted px-1 rounded">onLoad</code> callbacks
								for custom behavior.
							</CardDescription>
						</CardContent>
					</Card>
				</div>

				<div className="mt-16 text-center">
					<p className="text-muted-foreground">
						Or access the full pages directly:
					</p>
					<div className="mt-4 flex gap-4 justify-center text-sm">
						<Button asChild variant="link">
							<Link href="/auth/sign-in">/auth/sign-in</Link>
						</Button>
						<Button asChild variant="link">
							<Link href="/auth/sign-up">/auth/sign-up</Link>
						</Button>
						<Button asChild variant="link">
							<Link href="/auth/forgot-password">/auth/forgot-password</Link>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

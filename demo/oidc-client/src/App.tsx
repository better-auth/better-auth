import { Toaster } from "sonner";
import { Route, Router, Switch } from "wouter";
import { Logo } from "@/components/logo";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { Dashboard } from "@/pages/Dashboard";
import { Home } from "@/pages/Home";

function App() {
	const issuer = import.meta.env.VITE_OIDC_ISSUER;
	const clientId = import.meta.env.VITE_OIDC_CLIENT_ID;

	if (!issuer || !clientId) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<div className="text-center space-y-4">
					<h1 className="text-2xl font-bold text-destructive">
						Configuration Error
					</h1>
					<p className="text-muted-foreground">
						Please set VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID environment
						variables.
					</p>
					<p className="text-sm text-muted-foreground">
						Copy .env.example to .env and configure your OIDC provider settings.
					</p>
				</div>
			</div>
		);
	}

	return (
		<ThemeProvider attribute="class" defaultTheme="dark">
			<AuthProvider issuer={issuer} clientId={clientId}>
				<div className="min-h-screen bg-background text-foreground">
					{/* Header */}
					<header className="border-b">
						<div className="container mx-auto px-4 py-4 flex items-center justify-between">
							<Logo />
							<ThemeToggle />
						</div>
					</header>

					{/* Main Content */}
					<Router>
						<Switch>
							<Route path="/" component={Home} />
							<Route path="/dashboard" component={Dashboard} />
						</Switch>
					</Router>

					<Toaster richColors closeButton />
				</div>
			</AuthProvider>
		</ThemeProvider>
	);
}

export default App;

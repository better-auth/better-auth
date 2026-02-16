"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect } from "react";
import { getQueryClient } from "@/data/query-client";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

type Props = {
	children: React.ReactNode;
};

const Providers = ({ children }: Props) => {
	const queryClient = getQueryClient();

	useEffect(() => {
		const id = authClient.ensureElectronRedirect();
		return () => clearInterval(id);
	}, []);

	return (
		<ThemeProvider attribute="class" defaultTheme="dark">
			<QueryClientProvider client={queryClient}>
				<ReactQueryDevtools
					client={queryClient}
					initialIsOpen={false}
					buttonPosition="bottom-right"
					position="bottom"
				/>
				<Toaster richColors closeButton />
				{children}
			</QueryClientProvider>
		</ThemeProvider>
	);
};

export default Providers;

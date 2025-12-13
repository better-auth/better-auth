"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/data/query-client";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

type Props = {
	children: React.ReactNode;
};

const Providers = ({ children }: Props) => {
	const queryClient = getQueryClient();

	return (
		<ThemeProvider attribute="class" defaultTheme="dark">
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			<Toaster richColors closeButton />
		</ThemeProvider>
	);
};

export default Providers;

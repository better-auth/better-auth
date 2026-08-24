"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect } from "react";
import { toast } from "sonner";
import { ElectronManualSignInToast } from "@/app/(auth)/sign-in/_components/electron";
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
		const authorizationCode = authClient.electron.getAuthorizationCode();
		if (authorizationCode) {
			setTimeout(() => {
				toast.custom(
					(t) => (
						<ElectronManualSignInToast
							t={t}
							authorizationCode={authorizationCode}
						/>
					),
					{
						duration: 4_000,
					},
				);
			}, 1000);
		}
	}, []);
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

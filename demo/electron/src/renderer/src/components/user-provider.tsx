import {
	createContext,
	useContext,
	useEffect,
	useState,
	useTransition,
} from "react";
import type { authClient } from "../../../lib/auth-client";

const UserContext = createContext<{
	loading: boolean;
	user: (typeof authClient.$Infer.Session)["user"] | null;
	setUser: React.Dispatch<
		React.SetStateAction<(typeof authClient.$Infer.Session)["user"] | null>
	>;
} | null>(null);

export function UserProvider({
	children,
}: {
	children?: React.ReactNode | undefined;
}) {
	const [loading, startTransition] = useTransition();
	const [user, setUser] = useState<
		(typeof authClient.$Infer.Session)["user"] | null
	>(null);

	useEffect(() => {
		startTransition(async () => {
			setUser(await window.getUser());
		});
		const unsubscribe = window.onAuthenticated((u) => {
			setUser(u);
		});
		return () => {
			unsubscribe();
			setUser(null);
		};
	}, []);

	return (
		<UserContext.Provider
			value={{
				loading: !user && loading,
				user,
				setUser,
			}}
		>
			{children}
		</UserContext.Provider>
	);
}

export function useUser() {
	const state = useContext(UserContext);

	if (state === null) {
		throw new Error("useUser must be used within <UserProvider />");
	}

	return state;
}

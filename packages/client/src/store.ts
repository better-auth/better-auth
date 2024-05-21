import type { SessionResponse } from "better-auth/routes/session";
import { create } from "zustand";

interface Store {
	session: SessionResponse | null;
	setSession: (session: SessionResponse | null) => void;
}

export const useStore = create<Store>()((set) => ({
	session: null,
	setSession(session) {
		set({ session });
	},
}));

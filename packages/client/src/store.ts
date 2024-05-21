import type { SessionResponse } from "better-auth/routes/session";
import { create } from "zustand";

export interface Store {
	session: SessionResponse | null;
	setSession: (session: SessionResponse | null) => void;
}

export const useStore = create<Store>()((set) => ({
	session: null,
	setSession(session) {
		set({ session });
	},
}));

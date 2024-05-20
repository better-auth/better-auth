import { create } from "zustand";
import type { SessionResponse } from "../routes/session";

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

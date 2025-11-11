/**
 * Inspired by @see {@link https://github.com/ai/nanoevents}
 */

import type { EventEmitter, EventsMap } from "@better-auth/core";

export function createEvents<Events extends EventsMap>(): EventEmitter<Events> {
	return {
		events: {},
		emit(event, ...args) {
			for (const cb of this.events[event] || []) {
				cb(...args);
			}
		},
		on(event, cb) {
			(this.events[event] ||= []).push(cb);
			return () => {
				this.events[event] = this.events[event]?.filter((i) => cb !== i);
			};
		},
	};
}

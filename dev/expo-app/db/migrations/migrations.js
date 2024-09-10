// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from "./meta/_journal.json";
import m0000 from "./0000_cultured_lizard.sql";

export default {
	journal,
	migrations: {
		m0000,
	},
};

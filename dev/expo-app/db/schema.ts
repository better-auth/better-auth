import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

export const habitTable = sqliteTable("habits", {
  id: text("id")
    .$defaultFn(() => createId())
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  duration: integer("duration").notNull(),
  enableNotifications: integer("enable_notifications", {
    mode: "boolean",
  }).default(false),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const HabitSchema = createSelectSchema(habitTable);
export type Habit = z.infer<typeof HabitSchema>;

import AsyncStorage from "@react-native-async-storage/async-storage";

const HABIT_KEY = "habits";

export type Habit = {
  id: string;
  name: string;
  description: string;
  duration: number;
  category: string;
  enableNotifications: boolean;
};

export async function getHabits(): Promise<Habit[]> {
  const habitsString = await AsyncStorage.getItem(HABIT_KEY);
  if (!habitsString) {
    return [];
  }
  return JSON.parse(habitsString) as Habit[];
}

export async function setHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(HABIT_KEY, JSON.stringify(habits));
}

export async function deleteHabit(id: string): Promise<void> {
  const habits = await getHabits();
  const updatedHabits = habits.filter((habit) => habit.id !== id);
  await setHabits(updatedHabits);
}

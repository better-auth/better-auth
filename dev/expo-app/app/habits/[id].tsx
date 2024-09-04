import {zodResolver} from "@hookform/resolvers/zod";
import {createInsertSchema} from "drizzle-zod";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import * as React from "react";
import {useForm} from "react-hook-form";
import {Alert, Pressable, ScrollView, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import * as z from "zod";
import {eq} from "drizzle-orm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {Button} from "@/components/ui/button";
import {
  Form,
  FormCheckbox,
  FormCombobox,
  FormField,
  FormInput,
  FormRadioGroup,
  FormSelect,
  FormElement,
  FormSwitch,
  FormTextarea,
} from "@/components/ui/form";
import {Label} from "@/components/ui/label";
import {RadioGroupItem} from "@/components/ui/radio-group";
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {Text} from "@/components/ui/text";
import {useDatabase} from "@/db/provider";
import {habitTable} from "@/db/schema";
import {cn} from "@/lib/utils";
import type {Habit} from "@/lib/storage";

const HabitCategories = [
  {value: "health", label: "Health And Wellness"},
  {value: "personal-development", label: "Personal Development"},
  {value: "social-and-relationshipts", label: "Social And Relationships"},
  {value: "productivity", label: "Productivity"},
  {value: "creativity", label: "Creativity"},
  {value: "mindfulness", label: "Mindfulness"},
  {value: "financial", label: "Financial"},
  {value: "leisure", label: "Leisure"},
];

const HabitDurations = [
  {value: 5, label: "5 minutes"},
  {value: 10, label: "10 minutes"},
  {value: 15, label: "15 minutes"},
  {value: 30, label: "30 minutes"},
];

const formSchema = createInsertSchema(habitTable, {
  name: (schema) =>
    schema.name.min(4, {
      message: "Please enter a habit name.",
    }),
  description: (schema) =>
    schema.description.min(1, {
      message: "We need to know.",
    }),
  category: z.object(
    {value: z.string(), label: z.string()},
    {
      invalid_type_error: "Please select category",
    },
  ),
  duration: z.union([z.string(), z.number()]),
  enableNotifications: z.boolean(),
});

// TODO: refactor to use UI components

export default function FormScreen() {
  const {db} = useDatabase();
  const router = useRouter();
  const scrollRef = React.useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const [habit, setHabit] = React.useState<Habit>();
  const {id} = useLocalSearchParams<{id: string}>();

  const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
  useFocusEffect(
    React.useCallback(() => {
      fetchHabitById();
    }, []),
  );
  const defaultValues = React.useMemo(() => {
    if (habit) {
      return {
        name: habit.name,
        description: habit.description,
        category: HabitCategories.find((cat) => cat.value === habit.category),
        duration: habit.duration,
        enableNotifications: habit?.enableNotifications,
      }
    }
    return {
      name: "",
      description: "",
      duration: {
        label: "", value: ""
      },
      category: {
        label: "", value: ""
      },
      enableNotifications: false,
    }
  }, [habit])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues,
    values: defaultValues
  });

  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };
  const fetchHabitById = async () => {
    const fetchedHabit = await db
      ?.select()
      .from(habitTable)
      .where(eq(habitTable.id, id as string))
      .execute();
    if (fetchedHabit) {
      setHabit(fetchedHabit[0])
    }
  };
  const handleDeleteHabit = async () => {
    // Are you sure you want to delete this Habit ?
    try {
      await db?.delete(habitTable).where(eq(habitTable.id, id)).execute();
      router.replace("/")
    } catch (error) {
      console.error("error", error)
    }

  };

  async function handleSubmit(values: z.infer<typeof formSchema>) {
    try {
      await db?.update(habitTable).set({
        name: values.name,
        description: values.description,
        duration: Number(values.duration),
        category: values.category.value,
        enableNotifications: values.enableNotifications,
      }).where(eq(habitTable.id, id as string))
        .execute();

      router.replace("/");
    } catch (error) {
      console.error("error", error)
    }

  }
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerClassName="p-6 mx-auto w-full max-w-xl"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustContentInsets={false}
      contentInset={{top: 12}}
    >
      <Stack.Screen
        options={{
          title: "Habit",
        }}
      />
      <FormElement
        onSubmit={handleSubmit} >

        <Form {...form}>
          <View className="gap-7">
            <FormField
              control={form.control}
              name="name"
              render={({field}) => (
                <FormInput
                  label="Name"
                  className="text-foreground"

                  placeholder="habit name"
                  description="This will help you remind."
                  autoCapitalize="none"
                  {...field}
                />
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({field}) => (
                <FormTextarea
                  label="Description"

                  placeholder="Habit for ..."
                  description="habit description"
                  {...field}
                />
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({field}) => {
                return (
                  <FormSelect
                    label="Category"
                    description="Select on of the habit description"
                    {...field}



                  >
                    <SelectTrigger
                      onLayout={(ev) => {
                        setSelectTriggerWidth(ev.nativeEvent.layout.width);
                      }}
                    >
                      <SelectValue
                        className={cn(
                          "text-sm native:text-lg",
                          field.value ? "text-foreground" : "text-muted-foreground",
                        )}
                        placeholder="Select a habit category"
                      />
                    </SelectTrigger>
                    <SelectContent
                      insets={contentInsets}
                      style={{width: selectTriggerWidth}}
                    >
                      <SelectGroup>
                        {HabitCategories.map((cat) => (
                          <SelectItem
                            key={cat.value}
                            label={cat.label}
                            value={cat.value}
                          >
                            <Text>{cat.label}</Text>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </FormSelect>
                )
              }}
            />

            <FormField
              control={form.control}
              name="duration"
              render={({field}) => {
                function onLabelPress(value: number) {
                  return () => {
                    form.setValue("duration", value);
                  };
                }
                return (
                  <FormRadioGroup
                    label="Duration"
                    description="Select your duration."
                    className="gap-4"
                    {...field}
                    value={field.value.toString()}
                  >
                    {HabitDurations.map((item) => {
                      return (
                        <View
                          key={item.value}
                          className={"flex-row gap-2 items-center"}
                        >
                          <RadioGroupItem
                            aria-labelledby={`label-for-${ item.label }`}
                            value={item.value.toString()}
                          />
                          <Label
                            nativeID={`label-for-${ item.label }`}
                            className="capitalize"
                            onPress={onLabelPress(item.value)}
                          >
                            {item.label}
                          </Label>
                        </View>
                      );
                    })}
                  </FormRadioGroup>
                );
              }}
            />

            <FormField
              control={form.control}
              name="enableNotifications"
              render={({field}) => (
                <FormSwitch
                  label="Enable reminder"
                  description="We will send you notification reminder."
                  {...field}
                />
              )}
            />

            <Button disabled={!form.formState.isDirty} onPress={form.handleSubmit(handleSubmit)}>
              <Text>Update</Text>
            </Button>


          </View>
        </Form>
      </FormElement>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button

            variant="destructive"
            className="shadow shadow-foreground/5 my-4"
          >
            <Text>Delete</Text>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this Habit ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onPress={handleDeleteHabit}>
              <Text>Continue</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollView>
  );
}

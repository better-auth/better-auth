// This project uses code from shadcn/ui.
// The code is licensed under the MIT License.
// https://github.com/shadcn-ui/ui

import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  type Noop,
  useFormContext,
} from "react-hook-form";
import {Platform, View} from "react-native";
import Animated, {FadeInDown, FadeOut} from "react-native-reanimated";
import {cn} from "../../lib/utils";
import {Checkbox} from "./checkbox";
import {Combobox, type ComboboxOption} from "./combobox";
import {Input} from "./input";
import {Label} from "./label";
import {RadioGroup} from "./radio-group";
import {type Option, Select} from "./select";
import {Switch} from "./switch";
import {Text} from "./text";
import {Textarea} from "./textarea";

const Form = FormProvider;

export const FormElement = (props: any) => {
  return Platform.OS === "web" ? (
    <form {...props} />
  ) : (
    <View {...props} />
  );
};
type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{name: props.name}}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const {getFieldState, formState, handleSubmit} = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const {nativeID} = itemContext;

  return {
    nativeID,
    name: fieldContext.name,
    formItemNativeID: `${ nativeID }-form-item`,
    formDescriptionNativeID: `${ nativeID }-form-item-description`,
    formMessageNativeID: `${ nativeID }-form-item-message`,
    handleSubmit,
    ...fieldState,
  };
};

type FormItemContextValue = {
  nativeID: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

const FormItem = React.forwardRef<
  React.ElementRef<typeof View>,
  React.ComponentPropsWithoutRef<typeof View>
>(({className, ...props}, ref) => {
  const nativeID = React.useId();

  return (
    <FormItemContext.Provider value={{nativeID}}>
      <View ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  Omit<React.ComponentPropsWithoutRef<typeof Label>, "children"> & {
    children: string;
  }
>(({className, nativeID: _nativeID, ...props}, ref) => {
  const {error, formItemNativeID} = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(
        "pb-1 native:pb-2 px-px",
        error && "text-destructive",
        className,
      )}
      nativeID={formItemNativeID}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

const FormDescription = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentPropsWithoutRef<typeof Text>
>(({className, ...props}, ref) => {
  const {formDescriptionNativeID} = useFormField();

  return (
    <Text
      ref={ref}
      nativeID={formDescriptionNativeID}
      className={cn("text-sm text-muted-foreground pt-1", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  React.ElementRef<typeof Animated.Text>,
  React.ComponentPropsWithoutRef<typeof Animated.Text>
>(({className, children, ...props}, ref) => {
  const {error, formMessageNativeID} = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <Animated.Text
      entering={FadeInDown}
      exiting={FadeOut.duration(275)}
      ref={ref}
      nativeID={formMessageNativeID}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </Animated.Text>
  );
});
FormMessage.displayName = "FormMessage";

type Override<T, U> = Omit<T, keyof U> & U;

interface FormFieldFieldProps<T> {
  name: string;
  onBlur: Noop;
  onChange: (val: T) => void;
  value: T;
  disabled?: boolean;
}

type FormItemProps<T extends React.ElementType<any>, U> = Override<
  React.ComponentPropsWithoutRef<T>,
  FormFieldFieldProps<U>
> & {
  label?: string;
  description?: string;
};

const FormInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  FormItemProps<typeof Input, string>
>(({label, description, onChange, ...props}, ref) => {
  const inputRef = React.useRef<React.ComponentRef<typeof Input>>(null);
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  React.useImperativeHandle(
    ref,
    () => {
      if (!inputRef.current) {
        return {} as React.ComponentRef<typeof Input>;
      }
      return inputRef.current;
    },
    [inputRef.current],
  );

  function handleOnLabelPress() {
    if (!inputRef.current) {
      return;
    }
    if (inputRef.current.isFocused()) {
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
  }

  return (
    <FormItem>
      {!!label && (
        <FormLabel nativeID={formItemNativeID} onPress={handleOnLabelPress}>
          {label}
        </FormLabel>
      )}

      <Input
        ref={inputRef}
        aria-labelledby={formItemNativeID}
        aria-describedby={
          !error
            ? `${ formDescriptionNativeID }`
            : `${ formDescriptionNativeID } ${ formMessageNativeID }`
        }
        aria-invalid={!!error}
        onChangeText={onChange}
        {...props}
      />
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormInput.displayName = "FormInput";

const FormTextarea = React.forwardRef<
  React.ElementRef<typeof Textarea>,
  FormItemProps<typeof Textarea, string>
>(({label, description, onChange, ...props}, ref) => {
  const textareaRef = React.useRef<React.ComponentRef<typeof Textarea>>(null);
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  React.useImperativeHandle(
    ref,
    () => {
      if (!textareaRef.current) {
        return {} as React.ComponentRef<typeof Textarea>;
      }
      return textareaRef.current;
    },
    [textareaRef.current],
  );

  function handleOnLabelPress() {
    if (!textareaRef.current) {
      return;
    }
    if (textareaRef.current.isFocused()) {
      textareaRef.current?.blur();
    } else {
      textareaRef.current?.focus();
    }
  }

  return (
    <FormItem>
      {!!label && (
        <FormLabel nativeID={formItemNativeID} onPress={handleOnLabelPress}>
          {label}
        </FormLabel>
      )}

      <Textarea
        ref={textareaRef}
        aria-labelledby={formItemNativeID}
        aria-describedby={
          !error
            ? `${ formDescriptionNativeID }`
            : `${ formDescriptionNativeID } ${ formMessageNativeID }`
        }
        aria-invalid={!!error}
        onChangeText={onChange}
        {...props}
      />
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormTextarea.displayName = "FormTextarea";

const FormCheckbox = React.forwardRef<
  React.ElementRef<typeof Checkbox>,
  Omit<FormItemProps<typeof Checkbox, boolean>, "checked" | "onCheckedChange">
>(({label, description, value, onChange, ...props}, ref) => {
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  function handleOnLabelPress() {
    onChange?.(!value);
  }

  return (
    <FormItem className="px-1">
      <View className="flex-row gap-3 items-center">
        <Checkbox
          ref={ref}
          aria-labelledby={formItemNativeID}
          aria-describedby={
            !error
              ? `${ formDescriptionNativeID }`
              : `${ formDescriptionNativeID } ${ formMessageNativeID }`
          }
          aria-invalid={!!error}
          onCheckedChange={onChange}
          checked={value}
          {...props}
        />
        {!!label && (
          <FormLabel
            className="pb-0"
            nativeID={formItemNativeID}
            onPress={handleOnLabelPress}
          >
            {label}
          </FormLabel>
        )}
      </View>
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormCheckbox.displayName = "FormCheckbox";

// const FormDatePicker = React.forwardRef<
//   React.ElementRef<typeof Button>,
//   FormItemProps<typeof Calendar, string>
// >(({ label, description, value, onChange, ...props }, ref) => {
//   const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

//   return (
//     <FormItem>
//       {!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
//       <BottomSheet>
//         <BottomSheetOpenTrigger asChild>
//           <Button
//             variant='outline'
//             className='flex-row gap-3 justify-start px-3 relative'
//             ref={ref}
//             aria-labelledby={formItemNativeID}
//             aria-describedby={
//               !error
//                 ? `${formDescriptionNativeID}`
//                 : `${formDescriptionNativeID} ${formMessageNativeID}`
//             }
//             aria-invalid={!!error}
//           >
//             {({ pressed }) => (
//               <>
//                 <CalendarIcon
//                   className={buttonTextVariants({
//                     variant: 'outline',
//                     className: cn(!value && 'opacity-80', pressed && 'opacity-60'),
//                   })}
//                   size={18}
//                 />
//                 <Text
//                   className={buttonTextVariants({
//                     variant: 'outline',
//                     className: cn('font-normal', !value && 'opacity-70', pressed && 'opacity-50'),
//                   })}
//                 >
//                   {value ? value : 'Pick a date'}
//                 </Text>
//                 {!!value && (
//                   <Button
//                     className='absolute right-0 active:opacity-70 native:pr-3'
//                     variant='ghost'
//                     onPress={() => {
//                       onChange?.('');
//                     }}
//                   >
//                     <X size={18} className='text-muted-foreground text-xs' />
//                   </Button>
//                 )}
//               </>
//             )}
//           </Button>
//         </BottomSheetOpenTrigger>
//         <BottomSheetContent>
//           <BottomSheetView hadHeader={false} className='pt-2'>
//             <Calendar
//               style={{ height: 358 }}
//               onDayPress={(day) => {
//                 onChange?.(day.dateString === value ? '' : day.dateString);
//               }}
//               markedDates={{
//                 [value ?? '']: {
//                   selected: true,
//                 },
//               }}
//               current={value} // opens calendar on selected date
//               {...props}
//             />
//             <View className={'pb-2 pt-4'}>
//               <BottomSheetCloseTrigger asChild>
//                 <Button>
//                   <Text>Close</Text>
//                 </Button>
//               </BottomSheetCloseTrigger>
//             </View>
//           </BottomSheetView>
//         </BottomSheetContent>
//       </BottomSheet>
//       {!!description && <FormDescription>{description}</FormDescription>}
//       <FormMessage />
//     </FormItem>
//   );
// });

// FormDatePicker.displayName = 'FormDatePicker';

const FormRadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroup>,
  Omit<FormItemProps<typeof RadioGroup, string>, "onValueChange">
>(({label, description, value, onChange, ...props}, ref) => {
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  return (
    <FormItem className="gap-3">
      <View>
        {!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
        {!!description && (
          <FormDescription className="pt-0">{description}</FormDescription>
        )}
      </View>
      <RadioGroup
        ref={ref}
        aria-labelledby={formItemNativeID}
        aria-describedby={
          !error
            ? `${ formDescriptionNativeID }`
            : `${ formDescriptionNativeID } ${ formMessageNativeID }`
        }
        aria-invalid={!!error}
        onValueChange={onChange}
        value={value}
        {...props}
      />

      <FormMessage />
    </FormItem>
  );
});

FormRadioGroup.displayName = "FormRadioGroup";

const FormCombobox = React.forwardRef<
  React.ElementRef<typeof Combobox>,
  FormItemProps<typeof Combobox, ComboboxOption | null>
>(({label, description, value, onChange, ...props}, ref) => {
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  return (
    <FormItem>
      {!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
      <Combobox
        ref={ref}
        placeholder="Select framework"
        aria-labelledby={formItemNativeID}
        aria-describedby={
          !error
            ? `${ formDescriptionNativeID }`
            : `${ formDescriptionNativeID } ${ formMessageNativeID }`
        }
        aria-invalid={!!error}
        selectedItem={value}
        onSelectedItemChange={onChange}
        {...props}
      />
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormCombobox.displayName = "FormCombobox";

/**
 * @prop {children}
 * @example
 *  <SelectTrigger className='w-[250px]'>
      <SelectValue
        className='text-foreground text-sm native:text-lg'
        placeholder='Select a fruit'
      />
    </SelectTrigger>
    <SelectContent insets={contentInsets} className='w-[250px]'>
      <SelectGroup>
        <SelectLabel>Fruits</SelectLabel>
        <SelectItem label='Apple' value='apple'>
          Apple
        </SelectItem>
      </SelectGroup>
    </SelectContent>
 */
const FormSelect = React.forwardRef<
  React.ElementRef<typeof Select>,
  Omit<
    FormItemProps<typeof Select, Partial<Option>>,
    "open" | "onOpenChange" | "onValueChange"
  >
>(({label, description, onChange, value, ...props}, ref) => {
  const [open, setOpen] = React.useState(false);
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();
  return (
    <FormItem>
      {!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
      <Select
        ref={ref}
        aria-labelledby={formItemNativeID}
        aria-describedby={
          !error
            ? `${ formDescriptionNativeID }`
            : `${ formDescriptionNativeID } ${ formMessageNativeID }`
        }
        aria-invalid={!!error}
        open={open}
        onOpenChange={setOpen}
        value={
          value
            ? {label: value?.label ?? "", value: value?.value ?? ""}
            : undefined
        }
        onValueChange={onChange}
        {...props}
      />
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormSelect.displayName = "FormSelect";

const FormSwitch = React.forwardRef<
  React.ElementRef<typeof Switch>,
  Omit<FormItemProps<typeof Switch, boolean>, "checked" | "onCheckedChange">
>(({label, description, value, onChange, ...props}, ref) => {
  const switchRef = React.useRef<React.ComponentRef<typeof Switch>>(null);
  const {
    error,
    formItemNativeID,
    formDescriptionNativeID,
    formMessageNativeID,
  } = useFormField();

  React.useImperativeHandle(
    ref,
    () => {
      if (!switchRef.current) {
        return {} as React.ComponentRef<typeof Switch>;
      }
      return switchRef.current;
    },
    [switchRef.current],
  );

  function handleOnLabelPress() {
    onChange?.(!value);
  }

  return (
    <FormItem className="px-1">
      <View className="flex-row gap-3 items-center">
        <Switch
          ref={switchRef}
          aria-labelledby={formItemNativeID}
          aria-describedby={
            !error
              ? `${ formDescriptionNativeID }`
              : `${ formDescriptionNativeID } ${ formMessageNativeID }`
          }
          aria-invalid={!!error}
          onCheckedChange={onChange}
          checked={value}
          {...props}
        />
        {!!label && (
          <FormLabel
            className="pb-0"
            nativeID={formItemNativeID}
            onPress={handleOnLabelPress}
          >
            {label}
          </FormLabel>
        )}
      </View>
      {!!description && <FormDescription>{description}</FormDescription>}
      <FormMessage />
    </FormItem>
  );
});

FormSwitch.displayName = "FormSwitch";

export {
  Form,
  FormCheckbox,
  FormCombobox,
  //   FormDatePicker,
  FormDescription,
  FormField,
  FormInput,
  FormItem,
  FormLabel,
  FormMessage,
  FormRadioGroup,
  FormSelect,
  FormSwitch,
  FormTextarea,
  useFormField,
};

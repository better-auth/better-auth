import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { DatePicker } from "./ui/date-picker";
import { Input } from "./ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "./ui/input-otp";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
	SelectGroup,
	SelectItem,
	SelectRoot,
	SelectSeparator,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

export const defaultValues = {
	input: "",
	checkbox: false,
	calender: new Date(),
	otp: "",
	radio: "",
	slider: [0],
	select: "",
	switch: false,
};

export const fieldTypes = {
	input: Input,
	checkbox: Checkbox,
	calender: DatePicker,
	otp: InputOTP,
	otpGroup: InputOTPGroup,
	otpSlot: InputOTPSlot,
	otpSeparator: InputOTPSeparator,
	radio: RadioGroup,
	slider: Slider,
	select: SelectRoot,
	selectGroup: SelectGroup,
	selectItem: SelectItem,
	selectSeparator: SelectSeparator,
	switch: Switch,
	radioItem: RadioGroupItem,
} as const;

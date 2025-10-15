import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import type React from "react";
import type { AuthEndpoint } from "../../../../core/src/middleware";
import { Checkbox } from "@/ui/checkbox";
import { Calendar } from "@/ui/calendar";
import { InputOTP } from "@/ui/input-otp";
import { RadioGroup, RadioGroupItem } from "@/ui/radio-group";
import { Slider } from "@/ui/slider";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";


const fieldTypes = {
  input: Input,
  checkbox: Checkbox,
  calender: Calendar,
  otp: InputOTP,
  radio: RadioGroup,
  slider: Slider,
  select: Select,
  switch: Switch
} as const;

type RadioInfo = {
  options: {
    id: string;
    label: string;
    props?: React.ComponentProps<typeof RadioGroupItem>
  }[];
  props: {
    group: React.ComponentProps<typeof RadioGroup>
    item: React.ComponentProps<typeof RadioGroupItem>
  }
}

type Field<T extends keyof typeof fieldTypes> = {
	label: string;
	id: string;
	props: Omit<React.HTMLProps<typeof Input>, "id">;
	field: T;
	extra?: T extends "radio" ? RadioInfo : never;
};

const specialFields = ["radio", "select"] as const;

type Plugin = {
  field: string;
  location: {
    reference: "label" | "input" | "outside" | "inside" | "element";
    /**
     * Valid values:
     * 
     * Reference ===:
     * - "label" | "input" = "before" | "after" | "element"
     * - "outside" = "before" | "after"
     * - "inside" = "before" | "after" | "between"
     * 
     * If location is "element", the element is edited
     * If `node.element` is defined, the element is replaced
     */
    location: "before" | "after" | "element" | "between";
  }
  node: {
    /**
     * Only valid if reference is "element"
     */
    text?: string;
    /**
     * The entire element
     * Can be overridden by later plugins
     */
    element?: React.ReactNode;
  }
}

type Options = {
	fields: Field<keyof typeof fieldTypes>[];
	button: {
		label: string;
		endpoint: AuthEndpoint;
		props: Omit<
			React.ComponentProps<typeof Button>,
			"type" | "onClick" | "children"
		>;
	};
	plugins: Plugin[];
};

export default function Email({fields, button, plugins}: Options) {
	return (
    <div>
      {fields.map((f) => {
          const plugin = plugins.filter((p) => p.field === f.id);
          const labelPlugins = plugins.filter((p) => p.location.reference === "label");
          const inputPlugins = plugins.filter((p) => p.location.reference === "input");
          const outsidePlugins = plugins.filter((p) => p.location.reference === "outside");
          const insidePlugins = plugins.filter((p) => p.location.reference === "inside");

        
        return (
									<>
										<div className="grid gap-2" key={f.id}>
											{insidePlugins
												.filter(
													(p) =>
														p.location.reference === "inside" &&
														p.location.location === "before",
												)
												.map((p) => {
													if (p.node.element) throw new Error();
													return p.node.element;
												})}
											<div className="flex items-center">
												<Label htmlFor={f.id}>{f.label}</Label>
											</div>
											<div>
												{f.field in specialFields ? <></> : fieldTypes[f.field]}
											</div>
										</div>
									</>
								);
				})}

			<Button type="submit" onClick={async () => {}} {...button.props}>
				{button.label}
			</Button>
		</div>
	);
}

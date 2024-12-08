import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CircleDot, Key, Link, Fingerprint } from "lucide-react";
import { Label } from "../ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface Field {
  name: string;
  type: string;
  description: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isOptional?: boolean;
  isUnique?: boolean;
}

interface FieldIndicatorProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  bgColor: string;
}

const FieldIndicator = ({ icon, label, tooltip, bgColor }: FieldIndicatorProps) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="secondary" className={`mr-1 rounded-sm ${bgColor}`}>
          {React.cloneElement(icon as React.ReactElement, { 
            className: "w-3 h-3 mr-1", 
            size: 14 
          })}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const fieldIndicatorConfigs = {
  primaryKey: {
    icon: <Key />,
    label: "PK",
    tooltip: "Primary Key",
    bgColor: "bg-amber-500"
  },
  foreignKey: {
    icon: <Link />,
    label: "FK",
    tooltip: "Foreign Key",
    bgColor: "bg-blue-500"
  },
  unique: {
    icon: <Fingerprint />,
    label: "UQ",
    tooltip: "Unique Constraint",
    bgColor: "bg-purple-500"
  },
  optional: {
    icon: null,
    label: "?",
    tooltip: "Optional",
    bgColor: ""
  }
};

const FieldIndicators = ({ field }: { field: Field }) => {
  const indicators = [
    field.isPrimaryKey && "primaryKey",
    field.isForeignKey && "foreignKey",
    field.isUnique && "unique",
    field.isOptional && "optional"
  ].filter(Boolean) as (keyof typeof fieldIndicatorConfigs)[];

  if (indicators.length === 0) {
    return <span className="text-muted text-center">-</span>;
  }

  return (
    <>
      {indicators.map((type) => {
        const config = fieldIndicatorConfigs[type];
        return type === "optional" ? (
          <TooltipProvider key={type} delayDuration={0}>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline">?</Badge>
              </TooltipTrigger>
              <TooltipContent>Optional</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <FieldIndicator key={type} {...config} />
        );
      })}
    </>
  );
};

interface DatabaseTableProps {
  fields: Field[];
}

export default function DatabaseTable({ fields }: DatabaseTableProps) {
  return (
    <div className="border">
      <Table className="my-0">
        <TableHeader>
          <TableRow className="bg-primary/10 dark:bg-primary/20">
            <TableHead className="w-1/6">Field Name</TableHead>
            <TableHead className="w-1/6">Type</TableHead>
            <TableHead className="w-1/12">Key</TableHead>
            <TableHead className="w-1/2">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field, index) => (
            <TableRow
              key={index}
              className={index % 2 === 0 ? "bg-muted/50" : ""}
            >
              <TableCell className="font-medium">{field.name}</TableCell>
              <TableCell className="font-mono text-sm">
                <Badge variant="outline">{field.type}</Badge>
              </TableCell>
              <TableCell>
                <FieldIndicators field={field} />
              </TableCell>
              <TableCell>{field.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

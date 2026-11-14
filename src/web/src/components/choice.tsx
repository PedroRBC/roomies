import { Home } from "lucide-react";
import { useId } from "react";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
export function Choice({
  label,
  value,
  choices,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(value) => {
          if (value !== null) onChange(value);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className={
            hideLabel
              ? "h-10! w-full min-w-0 gap-2 bg-card px-3 font-semibold"
              : "w-full min-w-0"
          }
        >
          {hideLabel && (
            <Home
              className="size-[18px] text-[var(--accent-deep)]"
              aria-hidden="true"
            />
          )}
          <SelectValue className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {choices.find((item) => item.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

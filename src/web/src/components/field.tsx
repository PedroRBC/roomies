import { useId } from "react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Field({
  label,
  multiline,
  ...props
}: ComponentProps<"input"> & { label: string; multiline?: boolean }) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          name={props.name}
          required={props.required}
          maxLength={props.maxLength}
          defaultValue={props.defaultValue}
          rows={4}
        />
      ) : (
        <Input id={id} {...props} />
      )}
    </div>
  );
}

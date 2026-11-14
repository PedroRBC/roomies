import { useId } from "react";
import type { ComponentProps } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/lib/preferences";
import { useFinanceAction } from "./finance-resource";

export function FinanceError({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  const { t } = usePreferences();
  if (!error) return null;
  return (
    <Alert
      variant="destructive"
      role="alert"
      className="rounded-xl border-destructive/35 bg-destructive/10 p-3.5 text-base"
    >
      <AlertDescription>{error}</AlertDescription>
      {retry && (
        <Button variant="outline" onClick={retry}>
          {t("Retry", "Tentar novamente", "Reintentar")}
        </Button>
      )}
    </Alert>
  );
}
export function FinanceField({
  label,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      <Input id={id} {...props} />
    </div>
  );
}
export function FinanceText({
  label,
  ...props
}: ComponentProps<typeof Textarea> & { label: string }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-base font-semibold">
        {label}
      </Label>
      <Textarea id={id} rows={4} {...props} />
    </div>
  );
}
export function FinanceDelete({
  title,
  onCancel,
  onDelete,
  onDeleted,
  onUnauthorized,
}: {
  title: string;
  onCancel: () => void;
  onDelete: () => Promise<unknown>;
  onDeleted: () => void;
  onUnauthorized: () => void;
}) {
  const { t } = usePreferences();
  const action = useFinanceAction(onUnauthorized);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !action.busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle className="font-heading text-[22px] font-semibold leading-tight">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t(
            "This cannot be undone.",
            "Isso não pode ser desfeito.",
            "Esto no se puede deshacer.",
          )}
        </AlertDialogDescription>
        <FinanceError error={action.error} />
        <AlertDialogFooter>
          <Button
            variant="ghost"
            className="text-primary"
            disabled={action.busy}
            onClick={onCancel}
          >
            {t("Cancel", "Cancelar", "Cancelar")}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={action.busy}
            onClick={async () => {
              if (await action.run(onDelete)) onDeleted();
            }}
          >
            {action.busy
              ? t("Deleting…", "Excluindo…", "Eliminando…")
              : t(
                  "Confirm delete",
                  "Confirmar exclusão",
                  "Confirmar eliminación",
                )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

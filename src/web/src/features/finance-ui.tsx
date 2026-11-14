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
    <Alert variant="destructive" role="alert">
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
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
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
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
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
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {t(
            "This cannot be undone.",
            "Esta ação não pode ser desfeita.",
            "Esta acción no se puede deshacer.",
          )}
        </AlertDialogDescription>
        <FinanceError error={action.error} />
        <AlertDialogFooter>
          <Button variant="outline" disabled={action.busy} onClick={onCancel}>
            {t("Cancel", "Cancelar", "Cancelar")}
          </Button>
          <Button
            variant="destructive"
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

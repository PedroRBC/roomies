import { Fragment, useId, useState } from "react";
import type { Expense, Member } from "@/lib/api";
import { api } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canCreate,
  canMutate,
  expenseBody,
  parseMoneyCents,
  validRecipients,
} from "./finance-model";
import type { ExpenseDraft } from "./finance-model";
import { useFinanceAction, useExpenseValidation } from "./finance-resource";
import { FinanceError, FinanceField } from "./finance-ui";

export interface FinanceExpense extends Expense {
  payer_id: string;
  visibility: "shared" | "private";
}
export interface FinanceExpenseDetail {
  expense: FinanceExpense;
  splits: {
    id: string;
    expense_id: string;
    user_id: string;
    user_name?: string;
    share_amount: number;
  }[];
}
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function VisibilityFields({
  visibility,
  recipients,
  members,
  onVisibility,
  onRecipients,
  disabled,
}: {
  visibility: "shared" | "private";
  recipients: string[];
  members: Member[];
  onVisibility: (value: "shared" | "private") => void;
  onRecipients: (value: string[]) => void;
  disabled: boolean;
}) {
  const { t } = usePreferences();
  const id = useId();
  return (
    <fieldset disabled={disabled} className="grid gap-2.5">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-visibility`} className="text-base font-semibold">
          {t("Visibility", "Visibilidade", "Visibilidad")}
        </Label>
        <Select
          value={visibility}
          onValueChange={(value) => onVisibility(value as "shared" | "private")}
          disabled={disabled}
        >
          <SelectTrigger id={`${id}-visibility`} className="w-full">
            <SelectValue>
              {visibility === "private"
                ? t("Private", "Privada", "Privado")
                : t("Shared", "Compartilhada", "Compartido")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shared">
              {t("Shared", "Compartilhada", "Compartido")}
            </SelectItem>
            <SelectItem value="private">
              {t("Private", "Privada", "Privado")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {visibility === "private" && (
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">
            {t("Recipients", "Destinatários", "Destinatarios")}
          </legend>
          <p className="text-sm text-muted-foreground">
            {t(
              "The payer always has access. Select anyone else who may see this expense. Visibility does not change the split.",
              "O pagador sempre tem acesso. Selecione quem mais pode ver esta despesa. A visibilidade não altera a divisão.",
              "El pagador siempre tiene acceso. Selecciona quién más puede ver este gasto. La visibilidad no cambia el reparto.",
            )}
          </p>
          {members.map((member) => (
            <label
              key={member.user_id}
              htmlFor={`${id}-${member.user_id}`}
              className="flex items-center gap-3"
            >
              <Checkbox
                id={`${id}-${member.user_id}`}
                disabled={disabled}
                checked={recipients.includes(member.user_id)}
                onCheckedChange={(checked) =>
                  onRecipients(
                    checked
                      ? [...recipients, member.user_id]
                      : recipients.filter((value) => value !== member.user_id),
                  )
                }
              />
              {member.user_name}
            </label>
          ))}
        </fieldset>
      )}
    </fieldset>
  );
}
export function ExpenseForm(
  props: FeatureProps & {
    detail?: FinanceExpenseDetail;
    onSaved: () => void;
    onBusy?: (value: boolean) => void;
    onClose?: () => void;
  },
) {
  const { t, money } = usePreferences();
  const validation = useExpenseValidation();
  const original = props.detail?.expense;
  const Fields = original ? "details" : Fragment;
  const eligible = props.members.filter((member) => member.role !== "monitor");
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    amount: original?.amount.toFixed(2) ?? "",
    description: original?.description ?? "",
    category: original?.category ?? "",
    date: original?.date.slice(0, 10) ?? localToday(),
    visibility: original?.visibility ?? "shared",
    recipients: [],
    splitMode: original ? "keep" : "equal",
    shares: Object.fromEntries(
      (props.detail?.splits ?? [])
        .filter((split) =>
          eligible.some((member) => member.user_id === split.user_id),
        )
        .map((split) => [split.user_id, split.share_amount.toFixed(2)]),
    ),
  }));
  const action = useFinanceAction(props.onUnauthorized);
  const id = useId();
  const permitted = original
    ? canMutate(props.role, original.payer_id === props.user.id)
    : canCreate(props.role);
  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const totalShares = Object.values(draft.shares).reduce(
    (sum, value) => sum + (parseMoneyCents(value) ?? 0),
    0,
  );
  return (
    <form
      noValidate
      className="grid gap-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!permitted || action.busy) return;
        const result = expenseBody(draft, props.members, !!original);
        if (!result.ok) {
          action.setError(validation(result.error));
          return;
        }
        if (
          original &&
          draft.splitMode === "keep" &&
          parseMoneyCents(draft.amount) !== Math.round(original.amount * 100)
        ) {
          action.setError(validation("replacement"));
          return;
        }
        props.onBusy?.(true);
        const saved = await action.run(() =>
          api(
            `${housePath(props.houseId)}/expenses${original ? `/${encodeURIComponent(original.id)}` : ""}`,
            {
              method: original ? "PUT" : "POST",
              body: JSON.stringify(result.value),
            },
          ),
        );
        props.onBusy?.(false);
        if (saved) props.onSaved();
      }}
    >
      {original && (
        <>
          <FinanceField
            label={t("Description", "Descrição", "Descripción")}
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
            disabled={action.busy || !permitted}
            required
          />
          <p className="text-muted-foreground">
            {t("Active members", "Membros ativos", "Miembros activos")}:{" "}
            {props.members.map((member) => member.user_id).join(", ")}
          </p>
        </>
      )}
      <Fields>
        {original && (
          <summary className="cursor-pointer py-2 font-semibold text-primary">
            {t("More options", "Mais opções", "Más opciones")}
          </summary>
        )}
        <fieldset disabled={action.busy || !permitted} className="grid gap-2.5">
          <FinanceField
            label={t("Amount", "Valor", "Importe")}
            value={draft.amount}
            onChange={(event) => set("amount", event.target.value)}
            inputMode="decimal"
            required
          />
          {!original && (
            <FinanceField
              label={t("Description", "Descrição", "Descripción")}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              required
            />
          )}
          <fieldset className="grid gap-2.5">
            <div className="grid gap-1.5">
              <Label
                htmlFor={`${id}-split`}
                className="text-base font-semibold"
              >
                {t(
                  "Custom splits",
                  "Divisão personalizada",
                  "División personalizada",
                )}
              </Label>
              <Select
                value={draft.splitMode}
                onValueChange={(value) =>
                  set("splitMode", value as ExpenseDraft["splitMode"])
                }
                disabled={action.busy}
              >
                <SelectTrigger id={`${id}-split`} className="w-full">
                  <SelectValue>
                    {draft.splitMode === "keep"
                      ? t(
                          "Keep current splits",
                          "Manter divisão atual",
                          "Mantener reparto actual",
                        )
                      : draft.splitMode === "equal"
                        ? t("Equal split", "Divisão igual", "Reparto igual")
                        : t(
                            "Custom splits",
                            "Divisão personalizada",
                            "División personalizada",
                          )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {original && (
                    <SelectItem value="keep">
                      {t(
                        "Keep current splits",
                        "Manter divisão atual",
                        "Mantener reparto actual",
                      )}
                    </SelectItem>
                  )}
                  <SelectItem value="equal">
                    {t("Equal split", "Divisão igual", "Reparto igual")}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t(
                      "Custom splits",
                      "Divisão personalizada",
                      "División personalizada",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.splitMode === "custom" && (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Leave a share blank to exclude that member.",
                    "Deixe uma parte em branco para excluir o membro da divisão.",
                    "Deja una parte en blanco para excluir al miembro del reparto.",
                  )}
                </p>
                {eligible.map((member) => (
                  <FinanceField
                    key={member.user_id}
                    label={t(
                      `Share for ${member.user_name}`,
                      `Parte de ${member.user_name}`,
                      `Parte de ${member.user_name}`,
                    )}
                    inputMode="decimal"
                    value={draft.shares[member.user_id] ?? ""}
                    onChange={(event) =>
                      set("shares", {
                        ...draft.shares,
                        [member.user_id]: event.target.value,
                      })
                    }
                  />
                ))}
                <p>
                  {t("Split total", "Total da divisão", "Total del reparto")}:{" "}
                  {money(totalShares / 100)}
                </p>
              </div>
            )}
          </fieldset>
          <FinanceField
            label={t(
              "Category (optional)",
              "Categoria (opcional)",
              "Categoría (opcional)",
            )}
            value={draft.category}
            onChange={(event) => set("category", event.target.value)}
          />
          <FinanceField
            label={t("Date", "Data", "Fecha")}
            type="date"
            value={draft.date}
            onChange={(event) => set("date", event.target.value)}
            required
          />
          {!original && (
            <VisibilityFields
              visibility={draft.visibility}
              recipients={draft.recipients}
              members={props.members.filter(
                (member) => member.user_id !== props.user.id,
              )}
              onVisibility={(value) => set("visibility", value)}
              onRecipients={(value) => set("recipients", value)}
              disabled={action.busy}
            />
          )}
        </fieldset>
      </Fields>
      <FinanceError error={action.error} />
      <div
        className={original ? "flex flex-wrap justify-end gap-2 pt-2" : "py-2"}
      >
        <Button
          type="submit"
          variant={original ? "ghost" : "default"}
          className={original ? "text-primary" : "h-12 w-full"}
          disabled={action.busy || !permitted}
        >
          {action.busy
            ? t("Saving…", "Salvando…", "Guardando…")
            : original
              ? t("Save changes", "Salvar alterações", "Guardar cambios")
              : t("Save expense", "Salvar despesa", "Guardar gasto")}
        </Button>
        {original && props.onClose && (
          <Button
            type="button"
            variant="ghost"
            className="text-primary"
            disabled={action.busy}
            onClick={props.onClose}
          >
            {t("Close", "Fechar", "Cerrar")}
          </Button>
        )}
      </div>
    </form>
  );
}
export function ExpenseVisibility(
  props: FeatureProps & {
    expense: FinanceExpense;
    onSaved: () => void;
    onBusy: (value: boolean) => void;
  },
) {
  const { t } = usePreferences();
  const validation = useExpenseValidation();
  const [visibility, setVisibility] = useState(props.expense.visibility);
  const [recipients, setRecipients] = useState<string[]>([]);
  const action = useFinanceAction(props.onUnauthorized);
  return (
    <form
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          !canCreate(props.role) ||
          props.expense.payer_id !== props.user.id ||
          action.busy
        )
          return;
        if (
          visibility === "private" &&
          !validRecipients(recipients, props.members)
        ) {
          action.setError(validation("recipients"));
          return;
        }
        props.onBusy(true);
        const saved = await action.run(() =>
          api(
            `${housePath(props.houseId)}/expenses/${encodeURIComponent(props.expense.id)}/visibility`,
            {
              method: "POST",
              body: JSON.stringify({
                visibility,
                visible_to: visibility === "private" ? recipients : [],
              }),
            },
          ),
        );
        props.onBusy(false);
        if (saved) props.onSaved();
      }}
    >
      <p className="text-sm">
        {t(
          "Saving replaces all existing recipients. Select everyone who should retain access; the current recipient list is unavailable.",
          "Salvar substitui todos os destinatários existentes. Selecione todos que devem manter acesso; a lista atual não está disponível.",
          "Guardar reemplaza todos los destinatarios existentes. Selecciona a todos los que deban mantener el acceso; la lista actual no está disponible.",
        )}
      </p>
      <VisibilityFields
        visibility={visibility}
        recipients={recipients}
        members={props.members.filter(
          (member) => member.user_id !== props.user.id,
        )}
        onVisibility={setVisibility}
        onRecipients={setRecipients}
        disabled={action.busy}
      />
      <FinanceError error={action.error} />
      <Button className="my-2 h-12 w-full" disabled={action.busy} type="submit">
        {action.busy
          ? t("Saving…", "Salvando…", "Guardando…")
          : t("Save visibility", "Salvar visibilidade", "Guardar visibilidad")}
      </Button>
    </form>
  );
}

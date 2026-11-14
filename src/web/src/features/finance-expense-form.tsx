import { useId, useState } from "react";
import type { Expense, Member } from "@/lib/api";
import { api } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
    <fieldset disabled={disabled} className="grid gap-3">
      <legend className="mb-2 font-medium">
        {t("Visibility", "Visibilidade", "Visibilidad")}
      </legend>
      <RadioGroup
        value={visibility}
        onValueChange={(value) => onVisibility(value as "shared" | "private")}
        aria-label={t("Visibility", "Visibilidade", "Visibilidad")}
        disabled={disabled}
      >
        <label className="flex items-center gap-3" htmlFor={`${id}-shared`}>
          <RadioGroupItem id={`${id}-shared`} value="shared" />
          {t("Shared", "Compartilhada", "Compartido")}
        </label>
        <label className="flex items-center gap-3" htmlFor={`${id}-private`}>
          <RadioGroupItem id={`${id}-private`} value="private" />
          {t("Private", "Privada", "Privado")}
        </label>
      </RadioGroup>
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
  },
) {
  const { t, money } = usePreferences();
  const validation = useExpenseValidation();
  const original = props.detail?.expense;
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
      className="grid gap-4"
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
      <fieldset disabled={action.busy || !permitted} className="grid gap-4">
        <FinanceField
          label={t("Amount", "Valor", "Importe")}
          value={draft.amount}
          onChange={(event) => set("amount", event.target.value)}
          inputMode="decimal"
          required
        />
        <FinanceField
          label={t("Description", "Descrição", "Descripción")}
          value={draft.description}
          onChange={(event) => set("description", event.target.value)}
          required
        />
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
        <fieldset className="grid gap-3">
          <legend className="mb-2 font-medium">
            {t("Split", "Divisão", "Reparto")}
          </legend>
          <RadioGroup
            value={draft.splitMode}
            onValueChange={(value) =>
              set("splitMode", value as ExpenseDraft["splitMode"])
            }
            disabled={action.busy}
            aria-label={t("Split", "Divisão", "Reparto")}
          >
            {original && (
              <label className="flex items-center gap-3" htmlFor={`${id}-keep`}>
                <RadioGroupItem id={`${id}-keep`} value="keep" />
                {t(
                  "Keep current splits",
                  "Manter divisão atual",
                  "Mantener reparto actual",
                )}
              </label>
            )}
            <label className="flex items-center gap-3" htmlFor={`${id}-equal`}>
              <RadioGroupItem id={`${id}-equal`} value="equal" />
              {t("Equal split", "Divisão igual", "Reparto igual")}
            </label>
            <label className="flex items-center gap-3" htmlFor={`${id}-custom`}>
              <RadioGroupItem id={`${id}-custom`} value="custom" />
              {t(
                "Custom splits",
                "Divisão personalizada",
                "Reparto personalizado",
              )}
            </label>
          </RadioGroup>
          {draft.splitMode === "equal" && (
            <p className="text-sm text-muted-foreground">
              {t(
                "Split equally between current members, excluding monitors. Remaining cents go to the first members.",
                "Divisão igual entre os membros atuais, exceto monitores. Os centavos restantes vão para os primeiros membros.",
                "Reparto igual entre los miembros actuales, excepto monitores. Los céntimos restantes van a los primeros miembros.",
              )}
            </p>
          )}
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
      <FinanceError error={action.error} />
      <Button type="submit" disabled={action.busy || !permitted}>
        {action.busy
          ? t("Saving…", "Salvando…", "Guardando…")
          : original
            ? t("Save changes", "Salvar alterações", "Guardar cambios")
            : t("Save expense", "Salvar despesa", "Guardar gasto")}
      </Button>
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
      <Button disabled={action.busy} type="submit">
        {action.busy
          ? t("Saving…", "Salvando…", "Guardando…")
          : t("Save visibility", "Salvar visibilidade", "Guardar visibilidad")}
      </Button>
    </form>
  );
}

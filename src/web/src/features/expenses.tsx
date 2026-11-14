import { useState } from "react";
import { api } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  financeDate,
  canCreate,
  canMutate,
  canChangeVisibility,
} from "./finance-model";
import { useFinanceResource } from "./finance-resource";
import { FinanceDelete, FinanceError } from "./finance-ui";
import { ExpenseForm, ExpenseVisibility } from "./finance-expense-form";
import type {
  FinanceExpense,
  FinanceExpenseDetail,
} from "./finance-expense-form";

export function Expenses(props: FeatureProps) {
  return <ExpensesHouse key={`${props.houseId}:${props.user.id}`} {...props} />;
}
function ExpensesHouse(props: FeatureProps) {
  const { t, money, locale } = usePreferences();
  const path = `${housePath(props.houseId)}/expenses`;
  const resource = useFinanceResource<FinanceExpense[]>(
    path,
    props.onUnauthorized,
  );
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [selected, setSelected] = useState<FinanceExpense | null>(null);
  const [deleting, setDeleting] = useState<FinanceExpense | null>(null);
  const permitted = (expense: FinanceExpense) =>
    canMutate(props.role, expense.payer_id === props.user.id);
  function changed() {
    resource.reload();
    props.onChanged?.();
  }
  return (
    <section
      aria-label={t("Expenses", "Despesas", "Gastos")}
      className="grid gap-5"
    >
      <h2 className="roomies-page-title">
        {t("Expenses", "Despesas", "Gastos")}
      </h2>
      {canCreate(props.role) && (
        <Button
          className="my-2 h-12 w-full"
          disabled={creatingBusy}
          onClick={() => setCreating((value) => !value)}
        >
          {creating
            ? t("Cancel", "Cancelar", "Cancelar")
            : t("Add expense", "Adicionar despesa", "Añadir gasto")}
        </Button>
      )}
      {!canCreate(props.role) && (
        <p>
          {t(
            "Your role has view-only access.",
            "Seu papel permite apenas visualizar.",
            "Tu rol solo permite consultar.",
          )}
        </p>
      )}
      {creating && canCreate(props.role) && (
        <Card className="gap-0 rounded-[18px] border py-5 shadow-(--card-shadow) ring-0">
          <CardHeader className="px-5">
            <CardTitle className="mb-2 pt-2 font-sans text-[19px] font-bold leading-normal tracking-[-0.1px]">
              <h3>{t("New expense", "Nova despesa", "Nuevo gasto")}</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <ExpenseForm
              {...props}
              onBusy={setCreatingBusy}
              onSaved={() => {
                setCreating(false);
                changed();
              }}
            />
          </CardContent>
        </Card>
      )}
      <FinanceError error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <p role="status">
          {t("Loading expenses…", "Carregando despesas…", "Cargando gastos…")}
        </p>
      ) : resource.data?.length === 0 ? (
        <p>
          {t(
            "No expenses yet.",
            "Nenhuma despesa ainda.",
            "Aún no hay gastos.",
          )}
        </p>
      ) : (
        resource.data?.map((expense) => (
          <article key={expense.id}>
            <Card className="gap-0 rounded-[18px] border py-5 shadow-(--card-shadow) ring-0">
              <CardHeader className="px-5">
                <CardTitle className="mb-2 pt-2 font-sans text-[19px] font-bold leading-normal tracking-[-0.1px]">
                  <h3>{expense.description}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <p className="text-[15px] text-muted-foreground">
                  {financeDate(expense.date, locale)} · {money(expense.amount)}{" "}
                  · {expense.payer_name} ·{" "}
                  {expense.visibility === "private"
                    ? t("Private", "Privada", "Privado")
                    : t("Shared", "Compartilhada", "Compartido")}
                </p>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Button
                    className="h-10 px-4"
                    variant="outline"
                    onClick={() => setSelected(expense)}
                  >
                    {permitted(expense)
                      ? t(
                          "Details / edit",
                          "Detalhes / editar",
                          "Detalles / editar",
                        )
                      : t("Details", "Detalhes", "Detalles")}
                  </Button>
                  {permitted(expense) && (
                    <Button
                      variant="ghost"
                      className="h-10 px-4 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(expense)}
                    >
                      {t("Delete", "Excluir", "Eliminar")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </article>
        ))
      )}
      {selected && (
        <ExpenseDialog
          key={selected.id}
          {...props}
          expenseId={selected.id}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            changed();
          }}
        />
      )}
      {deleting && permitted(deleting) && (
        <FinanceDelete
          title={t("Delete expense?", "Excluir despesa?", "¿Eliminar gasto?")}
          onUnauthorized={props.onUnauthorized}
          onCancel={() => setDeleting(null)}
          onDelete={() =>
            api(`${path}/${encodeURIComponent(deleting.id)}`, {
              method: "DELETE",
            })
          }
          onDeleted={() => {
            setDeleting(null);
            changed();
          }}
        />
      )}
    </section>
  );
}
function ExpenseDialog(
  props: FeatureProps & {
    expenseId: string;
    onClose: () => void;
    onSaved: () => void;
  },
) {
  const { t, money, locale } = usePreferences();
  const resource = useFinanceResource<FinanceExpenseDetail>(
    `${housePath(props.houseId)}/expenses/${encodeURIComponent(props.expenseId)}`,
    props.onUnauthorized,
  );
  const [busy, setBusy] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const detail = resource.data;
  const editable =
    detail && canMutate(props.role, detail.expense.payer_id === props.user.id);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogTitle className="font-heading text-[22px] font-semibold leading-tight">
          {t("Expense details", "Detalhes da despesa", "Detalles del gasto")}
        </DialogTitle>
        <FinanceError error={resource.error} retry={resource.reload} />
        {resource.loading ? (
          <p role="status">
            {t("Loading expense…", "Carregando despesa…", "Cargando gasto…")}
          </p>
        ) : (
          detail && (
            <>
              {!editable && (
                <>
                  <p>{detail.expense.description}</p>
                  {detail.expense.category && <p>{detail.expense.category}</p>}
                </>
              )}
              {editable && (
                <div hidden={visibilityOpen}>
                  <ExpenseForm {...props} detail={detail} onBusy={setBusy} />
                </div>
              )}
              <details>
                <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
                  {t("Current splits", "Divisão atual", "Reparto actual")}
                </summary>
                <p>
                  {detail.expense.payer_name} · {money(detail.expense.amount)} ·{" "}
                  {financeDate(detail.expense.date, locale)} ·{" "}
                  {detail.expense.visibility === "private"
                    ? t("Private", "Privada", "Privado")
                    : t("Shared", "Compartilhada", "Compartido")}
                </p>
                <Table
                  aria-label={t(
                    "Current splits",
                    "Divisão atual",
                    "Reparto actual",
                  )}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">
                        {t("Member", "Membro", "Miembro")}
                      </TableHead>
                      <TableHead scope="col">
                        {t("Share", "Parte", "Parte")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.splits.map((split) => (
                      <TableRow key={split.id}>
                        <TableHead scope="row">
                          {split.user_name ||
                            props.members.find(
                              (member) => member.user_id === split.user_id,
                            )?.user_name ||
                            split.user_id}
                        </TableHead>
                        <TableCell>{money(split.share_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
              {canChangeVisibility(
                props.role,
                detail.expense.payer_id === props.user.id,
              ) && (
                <>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => setVisibilityOpen((value) => !value)}
                  >
                    {visibilityOpen
                      ? t(
                          "Back to expense",
                          "Voltar à despesa",
                          "Volver al gasto",
                        )
                      : t(
                          "Change visibility",
                          "Alterar visibilidade",
                          "Cambiar visibilidad",
                        )}
                  </Button>
                  {visibilityOpen && (
                    <ExpenseVisibility
                      {...props}
                      expense={detail.expense}
                      onBusy={setBusy}
                    />
                  )}
                </>
              )}
            </>
          )
        )}
        {(!editable || visibilityOpen) && (
          <Button
            variant="ghost"
            className="justify-self-end text-primary"
            disabled={busy}
            onClick={props.onClose}
          >
            {t("Close", "Fechar", "Cerrar")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

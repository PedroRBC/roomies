import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import type { ExpenseValidation } from "./finance-model";

export function useFinanceResource<T>(
  path: string,
  onUnauthorized: () => void,
) {
  const [response, setResponse] = useState<{
    key: string;
    data: T | null;
    error: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const unauthorized = useRef(onUnauthorized);
  const { t } = usePreferences();
  const fallback = t(
    "Unable to load. Try again.",
    "Não foi possível carregar. Tente novamente.",
    "No se pudo cargar. Inténtalo de nuevo.",
  );
  const key = `${path}\0${revision}\0${fallback}`;
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (active) setResponse({ key, data: value, error: "" });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setResponse({
          key,
          data: null,
          error: err instanceof Error ? err.message : fallback,
        });
        if (err instanceof ApiError && err.status === 401)
          unauthorized.current();
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, key, fallback]);
  const current = response?.key === key ? response : null;
  return {
    data: current?.data ?? null,
    loading: !current,
    error: current?.error ?? "",
    reload: () => setRevision((value) => value + 1),
  };
}

export function useFinanceAction(onUnauthorized: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  const { t } = usePreferences();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run(action: () => Promise<unknown>) {
    if (pending.current || !active.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      return active.current;
    } catch (err) {
      if (active.current) {
        setError(
          err instanceof Error
            ? err.message
            : t(
                "Unable to save. Try again.",
                "Não foi possível salvar. Tente novamente.",
                "No se pudo guardar. Inténtalo de nuevo.",
              ),
        );
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
      }
      return false;
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function useExpenseValidation() {
  const { t } = usePreferences();
  const messages: Record<ExpenseValidation, string> = {
    amount: t(
      "Enter a positive amount with at most two decimals (maximum 99,999,999.99).",
      "Informe um valor positivo com até duas casas decimais (máximo 99.999.999,99).",
      "Introduce un importe positivo con hasta dos decimales (máximo 99.999.999,99).",
    ),
    description: t(
      "Description is required.",
      "A descrição é obrigatória.",
      "La descripción es obligatoria.",
    ),
    date: t(
      "Enter a valid date.",
      "Informe uma data válida.",
      "Introduce una fecha válida.",
    ),
    recipients: t(
      "Recipients must be current house members.",
      "Os destinatários devem ser membros atuais da casa.",
      "Los destinatarios deben ser miembros actuales de la casa.",
    ),
    splitMember: t(
      "Select eligible house members for splits. Monitors cannot owe shares.",
      "Selecione membros elegíveis para a divisão. Monitores não participam da divisão.",
      "Selecciona miembros aptos para el reparto. Los monitores no participan.",
    ),
    splitPositive: t(
      "Each replacement share must be positive with at most two decimals.",
      "Cada parte deve ser positiva e ter até duas casas decimais.",
      "Cada parte debe ser positiva y tener hasta dos decimales.",
    ),
    splitTotal: t(
      "Custom splits must exactly equal the expense amount.",
      "A divisão personalizada deve somar exatamente o valor da despesa.",
      "El reparto personalizado debe sumar exactamente el importe del gasto.",
    ),
    replacement: t(
      "Choose equal or custom replacement splits when changing the amount.",
      "Escolha uma nova divisão igual ou personalizada ao alterar o valor.",
      "Elige un nuevo reparto igual o personalizado al cambiar el importe.",
    ),
  };
  return (code: ExpenseValidation) => messages[code];
}

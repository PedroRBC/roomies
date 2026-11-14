import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Choice } from "@/components/choice";
import { Field } from "@/components/field";
import { ConfirmAction } from "@/components/confirm-action";
interface Invitation {
  id: string;
  house_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  manual_acceptance_url?: string;
}
export function Members({
  houseId,
  user,
  role,
  members,
  onUnauthorized,
  onChanged,
}: FeatureProps) {
  const { t, locale } = usePreferences();
  const admin = role === "admin";
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(admin);
  const [revision, setRevision] = useState(0);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [inviteRole, setInviteRole] = useState("member");
  const [pending, setPending] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const base = housePath(houseId);
  useEffect(() => {
    if (!admin) return;
    let active = true;
    api<Invitation[]>(`${base}/invites`)
      .then((result) => {
        if (active) {
          setInvites(result);
          setError("");
        }
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) onUnauthorized();
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, revision, admin, onUnauthorized]);
  const roles = [
    { value: "member", label: t("Member", "Membro", "Miembro") },
    {
      value: "admin",
      label: t("Administrator", "Administrador", "Administrador"),
    },
    { value: "monitor", label: t("Monitor", "Monitor", "Monitor") },
  ];
  async function mutate(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api(`${base}${path}`, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
      throw err;
    } finally {
      setBusy(false);
    }
  }
  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email")).trim();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const invite = await api<Invitation>(`${base}/invites`, {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setLink(
        invite.manual_acceptance_url
          ? { id: invite.id, url: invite.manual_acceptance_url }
          : null,
      );
      form.reset();
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) onUnauthorized();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-5">
      <h2 className="roomies-page-title mb-2">
        {t("Members", "Membros", "Miembros")}
      </h2>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {admin && (
              <Button
                className="ml-3"
                variant="outline"
                size="sm"
                disabled={busy || loading}
                onClick={() => {
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                {t("Retry", "Tentar novamente", "Reintentar")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {status && <p role="status">{status}</p>}
      {admin && (
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-[19px] font-bold">
              {t("Invite by email", "Convidar por email", "Invitar por correo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form onSubmit={send} className="grid gap-4">
              <Field label="Email" name="email" type="email" required />
              <Choice
                label={t("Role", "Função", "Rol")}
                value={inviteRole}
                choices={roles}
                onChange={setInviteRole}
              />
              <Button type="submit" disabled={busy} className="mt-2 w-full">
                {t("Send invitation", "Enviar convite", "Enviar invitación")}
              </Button>
            </form>
            {link && (
              <div className="grid gap-3 rounded-lg border p-4">
                <p className="text-sm">
                  {t(
                    "This invitation link is shown only once.",
                    "Este link de convite é mostrado apenas uma vez.",
                    "Este enlace de invitación se muestra solo una vez.",
                  )}
                </p>
                <Field
                  label={t(
                    "Invitation link",
                    "Link do convite",
                    "Enlace de invitación",
                  )}
                  value={link.url}
                  readOnly
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link.url);
                      setStatus(
                        t("Link copied", "Link copiado", "Enlace copiado"),
                      );
                    } catch {
                      setError(
                        t(
                          "Unable to copy. Select and copy the link above.",
                          "Não foi possível copiar. Selecione e copie o link acima.",
                          "No se pudo copiar. Selecciona y copia el enlace de arriba.",
                        ),
                      );
                    }
                  }}
                >
                  {t("Copy link", "Copiar link", "Copiar enlace")}
                </Button>
              </div>
            )}
            <h3 className="text-[19px] font-bold">
              {t(
                "Invitation history",
                "Histórico de convites",
                "Historial de invitaciones",
              )}
            </h3>
            {loading ? (
              <p role="status">
                {t(
                  "Loading invitations…",
                  "Carregando convites…",
                  "Cargando invitaciones…",
                )}
              </p>
            ) : invites.length === 0 ? (
              <p className="text-base">
                {t(
                  "No invitations yet.",
                  "Nenhum convite ainda.",
                  "Aún no hay invitaciones.",
                )}
              </p>
            ) : (
              <ul>
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p>{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {
                          roles.find((item) => item.value === invite.role)
                            ?.label
                        }{" "}
                        · {invite.status} ·{" "}
                        {new Date(invite.expires_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                    {invite.status === "pending" && (
                      <ConfirmAction
                        title={t(
                          "Revoke invitation?",
                          "Revogar convite?",
                          "¿Revocar invitación?",
                        )}
                        description={t(
                          "This link will no longer allow the recipient to join.",
                          "Este link não permitirá mais que a pessoa entre.",
                          "Este enlace ya no permitirá que la persona se una.",
                        )}
                        label={t("Revoke", "Revogar", "Revocar")}
                        disabled={busy}
                        action={async () => {
                          await mutate(
                            `/invites/${encodeURIComponent(invite.id)}`,
                            "DELETE",
                          );
                          if (link?.id === invite.id) setLink(null);
                          setRevision((value) => value + 1);
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <ul className="grid gap-4">
        {members.map((member) => (
          <li key={member.user_id}>
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-[19px] font-bold">
                  {member.user_name}
                  {member.user_id === user.id
                    ? ` (${t("you", "você", "tú")})`
                    : ""}
                </CardTitle>
                <CardDescription className="text-base text-foreground">
                  {member.user_email} ·{" "}
                  {roles.find((item) => item.value === member.role)?.label ??
                    member.role}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {admin && (
                  <div className="flex flex-wrap items-end gap-3">
                    <Choice
                      label={`${t("Role for", "Função de", "Rol de")} ${member.user_name}`}
                      value={pending[member.user_id] ?? member.role}
                      choices={roles}
                      disabled={busy}
                      onChange={(value) =>
                        setPending((current) => ({
                          ...current,
                          [member.user_id]: value,
                        }))
                      }
                    />
                    <Button
                      variant="ghost"
                      className="text-primary"
                      disabled={
                        busy ||
                        (pending[member.user_id] ?? member.role) === member.role
                      }
                      onClick={() =>
                        void mutate(
                          `/members/${encodeURIComponent(member.user_id)}`,
                          "PUT",
                          { role: pending[member.user_id] ?? member.role },
                        ).catch(() => {})
                      }
                    >
                      {t("Change role", "Alterar função", "Cambiar rol")}
                    </Button>
                    <ConfirmAction
                      title={t(
                        "Remove member?",
                        "Remover membro?",
                        "¿Eliminar miembro?",
                      )}
                      description={`${member.user_name}: ${t("They will lose access to this house.", "A pessoa perderá o acesso a esta casa.", "Esta persona perderá el acceso a esta casa.")}`}
                      label={t("Remove", "Remover", "Eliminar")}
                      disabled={busy}
                      action={() =>
                        mutate(
                          `/members/${encodeURIComponent(member.user_id)}`,
                          "DELETE",
                        )
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useState } from "react";
import { api } from "@/lib/api";
import type { Note } from "@/lib/api";
import { housePath } from "@/lib/features";
import type { FeatureProps } from "@/lib/features";
import { usePreferences } from "@/lib/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { financeDate, canCreate, canMutate } from "./finance-model";
import { useFinanceAction, useFinanceResource } from "./finance-resource";
import {
  FinanceDelete,
  FinanceError,
  FinanceField,
  FinanceText,
} from "./finance-ui";
interface HouseNote extends Note {
  author_id: string;
  updated_at: string;
}

export function Notes(props: FeatureProps) {
  return <NotesHouse key={`${props.houseId}:${props.user.id}`} {...props} />;
}
function NotesHouse(props: FeatureProps) {
  const { t, locale } = usePreferences();
  const path = `${housePath(props.houseId)}/notes`;
  const resource = useFinanceResource<HouseNote[]>(path, props.onUnauthorized);
  const [editing, setEditing] = useState<HouseNote | null>(null);
  const [deleting, setDeleting] = useState<HouseNote | null>(null);
  const permitted = (note: HouseNote) =>
    canMutate(props.role, note.author_id === props.user.id);
  function changed() {
    resource.reload();
    props.onChanged?.();
  }
  return (
    <section aria-label={t("Notes", "Notas", "Notas")} className="grid gap-5">
      <h2 className="roomies-page-title">{t("Notes", "Notas", "Notas")}</h2>
      {canCreate(props.role) ? (
        <Card className="gap-0 rounded-[18px] border py-5 shadow-(--card-shadow) ring-0">
          <CardHeader className="px-5">
            <CardTitle className="mb-2 pt-2 font-sans text-[19px] font-bold leading-normal tracking-[-0.1px]">
              <h3>{t("New note", "Nova nota", "Nueva nota")}</h3>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <NoteForm {...props} onSaved={changed} />
          </CardContent>
        </Card>
      ) : (
        <p>
          {t(
            "Your role has view-only access.",
            "Seu papel permite apenas visualizar.",
            "Tu rol solo permite consultar.",
          )}
        </p>
      )}
      <FinanceError error={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <p role="status">
          {t("Loading notes…", "Carregando notas…", "Cargando notas…")}
        </p>
      ) : resource.data?.length === 0 ? (
        <p>{t("No notes yet.", "Nenhuma nota ainda.", "Aún no hay notas.")}</p>
      ) : (
        resource.data?.map((note) => (
          <article key={note.id}>
            <Card className="gap-0 rounded-[18px] border py-5 shadow-(--card-shadow) ring-0">
              <CardHeader className="px-5">
                <CardTitle className="mb-2 pt-2 font-sans text-[19px] font-bold leading-normal tracking-[-0.1px]">
                  <h3>{note.title}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <p className="whitespace-pre-wrap break-words text-[15px] text-muted-foreground">
                  {note.content}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    `By ${note.author_name} · updated ${financeDate(note.updated_at, locale, true)}`,
                    `Por ${note.author_name} · atualizado ${financeDate(note.updated_at, locale, true)}`,
                    `Por ${note.author_name} · actualizado ${financeDate(note.updated_at, locale, true)}`,
                  )}
                </p>
                {permitted(note) && (
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="h-10 px-4"
                      onClick={() => setEditing(note)}
                    >
                      {t("Edit", "Editar", "Editar")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-10 px-4 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(note)}
                    >
                      {t("Delete", "Excluir", "Eliminar")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </article>
        ))
      )}
      {editing && permitted(editing) && (
        <NoteEditor
          key={editing.id}
          {...props}
          note={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      )}
      {deleting && permitted(deleting) && (
        <FinanceDelete
          title={t("Delete note?", "Excluir nota?", "¿Eliminar nota?")}
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
function NoteEditor(
  props: FeatureProps & {
    note: HouseNote;
    onClose: () => void;
    onSaved: () => void;
  },
) {
  const { t } = usePreferences();
  const [busy, setBusy] = useState(false);
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
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
      >
        <DialogTitle className="font-heading text-[22px] font-semibold leading-tight">
          {t("Edit note", "Editar nota", "Editar nota")}
        </DialogTitle>
        <NoteForm {...props} setBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}
function NoteForm(
  props: FeatureProps & {
    note?: HouseNote;
    onSaved: () => void;
    setBusy?: (value: boolean) => void;
    onClose?: () => void;
  },
) {
  const { t } = usePreferences();
  const [title, setTitle] = useState(props.note?.title ?? "");
  const [content, setContent] = useState(props.note?.content ?? "");
  const action = useFinanceAction(props.onUnauthorized);
  const allowed = props.note
    ? canMutate(props.role, props.note.author_id === props.user.id)
    : canCreate(props.role);
  return (
    <form
      noValidate
      className="grid gap-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!allowed || action.busy) return;
        if (!title.trim() || !content.trim()) {
          action.setError(
            t(
              "Title and content are required.",
              "Título e conteúdo são obrigatórios.",
              "El título y el contenido son obligatorios.",
            ),
          );
          return;
        }
        props.setBusy?.(true);
        const saved = await action.run(() =>
          api(
            `${housePath(props.houseId)}/notes${props.note ? `/${encodeURIComponent(props.note.id)}` : ""}`,
            {
              method: props.note ? "PUT" : "POST",
              body: JSON.stringify({
                title: title.trim(),
                content: content.trim(),
              }),
            },
          ),
        );
        props.setBusy?.(false);
        if (saved) {
          setTitle("");
          setContent("");
          props.onSaved();
        }
      }}
    >
      <FinanceField
        label={t("Title", "Título", "Título")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={action.busy}
        required
      />
      <FinanceText
        label={t("Content", "Conteúdo", "Contenido")}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        disabled={action.busy}
        required
        rows={5}
      />
      <FinanceError error={action.error} />
      <div
        className={
          props.note ? "flex flex-wrap justify-end gap-2 pt-2" : "py-2"
        }
      >
        <Button
          type="submit"
          variant={props.note ? "ghost" : "default"}
          className={props.note ? "text-primary" : "h-12 w-full"}
          disabled={action.busy || !allowed}
        >
          {action.busy
            ? t("Saving…", "Salvando…", "Guardando…")
            : props.note
              ? t("Save changes", "Salvar alterações", "Guardar cambios")
              : t("Save note", "Salvar nota", "Guardar nota")}
        </Button>
        {props.note && props.onClose && (
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

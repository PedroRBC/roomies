import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { usePreferences } from "@/lib/preferences";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { invitationToken, clearInvitation } from "./invitation-state";
export function AcceptInvitation({
  onJoined,
  onUnauthorized,
}: {
  onJoined: (houseId: string) => void;
  onUnauthorized: () => void;
}) {
  const { t } = usePreferences();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const request = useRef<Promise<{ invitation: { house_id: string } }> | null>(
    null,
  );
  const joined = useRef(onJoined),
    unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    joined.current = onJoined;
    unauthorized.current = onUnauthorized;
  }, [onJoined, onUnauthorized]);
  useEffect(() => {
    let active = true;
    const pending = invitationToken();
    request.current ??= pending
      ? api("/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token: pending }),
        })
      : Promise.reject(
          new Error(
            "No pending invitation. Open your invitation link to join a house.",
          ),
        );
    request.current
      .then((result) => {
        if (active) {
          clearInvitation();
          joined.current(result.invitation.house_id);
        }
      })
      .catch((err: ApiError) => {
        if (active) {
          setError(err.message);
          if (err.status === 401) unauthorized.current();
        }
      });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          {t("Join a house", "Entrar em uma casa", "Unirse a una casa")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="grid gap-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              onClick={() => {
                request.current = null;
                setError("");
                setRevision((value) => value + 1);
              }}
            >
              {t(
                "Retry invitation",
                "Tentar convite novamente",
                "Reintentar invitación",
              )}
            </Button>
          </div>
        ) : (
          <p role="status">
            {t(
              "Joining your household…",
              "Entrando na sua casa…",
              "Uniéndote a tu casa…",
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

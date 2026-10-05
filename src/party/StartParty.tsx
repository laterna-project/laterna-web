import { useMutation } from "@connectrpc/connect-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { PartyService } from "../gen/laterna/v1/party_pb";

/**
 * "Watch together" button: creates a watch party (the caller is its host, paused at first) with
 * these items (a series gives its episodes, an album its tracks) and opens it.
 */
export function StartParty({
  itemIds,
  className,
  children,
}: {
  itemIds: readonly string[];
  className: string | undefined;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useMutation(PartyService.method.createParty, {
    onSuccess: (res) => {
      if (res.party) void navigate({ to: "/play/party/$id", params: { id: res.party.id } });
    },
  });
  return (
    <button
      type="button"
      className={className}
      disabled={create.isPending || itemIds.length === 0}
      title={create.isError ? errorMessage(create.error) : t("party.start")}
      onClick={() => create.mutate({ itemIds: [...itemIds], hostOnly: false })}
    >
      {children}
    </button>
  );
}

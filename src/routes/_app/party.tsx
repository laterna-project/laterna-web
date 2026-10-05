import { useMutation } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import styles from "../../features/lists/collections.module.css";
import { PartyService } from "../../gen/laterna/v1/party_pb";
import partyStyles from "../../party/party.module.css";
import { universeBlock } from "../../theme/universe";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";

export const Route = createFileRoute("/_app/party")({
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === "string" && search.code ? { code: search.code } : {},
  component: Together,
});

/** Join a watch party with its code; one is created from a detail page ("Watch together"). */
function Together() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState(search.code ?? "");
  const join = useMutation(PartyService.method.joinParty, {
    onSuccess: (res) => {
      if (res.party) void navigate({ to: "/play/party/$id", params: { id: res.party.id } });
    },
  });
  // 6-character code, without 0/O or 1/I/L (server); case does not matter.
  const clean = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  return (
    <div className={styles.page}>
      <section
        className={styles.head}
        style={universeBlock("party")}
        data-ui="page-header"
        data-universe="party"
      >
        <div>
          <h1 className={styles.title}>{t("party.title")}</h1>
          <p className={styles.subtitle}>{t("party.pageSubtitle")}</p>
        </div>
      </section>
      <section className={styles.panel}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 6) join.mutate({ code: clean });
          }}
        >
          <h2 className={partyStyles.title}>{t("party.joinTitle")}</h2>
          {join.isError && <Alert>{errorMessage(join.error)}</Alert>}
          <Field
            label={t("party.codeLabel")}
            hint={t("party.codeHint")}
            value={clean}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder="K7QM4X"
          />
          <Button type="submit" variant="primary" disabled={clean.length !== 6 || join.isPending}>
            {t("party.joinButton")}
          </Button>
        </form>
        <p className={styles.overview}>{t("party.howTo")}</p>
      </section>
    </div>
  );
}

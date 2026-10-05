import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { Alert } from "../ui/Alert";
import { PartyPanel } from "./PartyPanel";
import { PartyStage } from "./PartyStage";
import styles from "./party.module.css";
import { useParty } from "./useParty";

/** Watch party: playback in step with the group, and the group's panel. */
export function PartyRoom({ partyId }: { partyId: string }) {
  const { t } = useTranslation();
  const session = useParty(partyId);
  if (session.ended || session.loadError)
    return (
      <main className={styles.endScreen}>
        <h1 className={styles.endTitle}>{t("party.endedTitle")}</h1>
        <p>{session.ended ?? errorMessage(session.loadError)}</p>
        <Link to="/" className={styles.endLink}>
          {t("common.backHome")}
        </Link>
      </main>
    );
  return (
    <main className={styles.room}>
      <PartyStage session={session} />
      <PartyPanel session={session} />
      {session.error && !session.party && <Alert>{session.error}</Alert>}
    </main>
  );
}

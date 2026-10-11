import { useMutation } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import {
  type RequestableTitle,
  type RequestDestination,
  RequestService,
} from "../../gen/laterna/v1/request_pb";
import { Button } from "../../ui/Button";
import styles from "./requests.module.css";
import { DestinationPicker } from "./ui";

/**
 * Asks for several titles at once: the volumes of a series of books, ticked in the results. Each
 * is a request of its own, sent one after the other, since each counts in the account's quota.
 * onDone gets how many went through and why the others did not.
 */
export function AskMany({
  titles,
  destinations,
  onDone,
}: {
  titles: readonly RequestableTitle[];
  /** Destinations of the titles' family. */
  destinations: readonly RequestDestination[];
  onDone: (sent: number, failures: string[]) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [destination, setDestination] = useState(destinations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const { mutateAsync } = useMutation(RequestService.method.createRequest);
  const ask = async () => {
    setBusy(true);
    const failures: string[] = [];
    let sent = 0;
    for (const title of titles) {
      try {
        await mutateAsync({
          kind: title.kind,
          externalKey: title.externalKey,
          destinationId: destinations.length > 1 ? destination : "",
        });
        sent += 1;
      } catch (err) {
        failures.push(t("requests.many.failed", { title: title.title, reason: errorMessage(err) }));
      }
    }
    await invalidate(RequestService);
    setBusy(false);
    onDone(sent, failures);
  };
  return (
    <div className={styles.many}>
      <DestinationPicker destinations={destinations} value={destination} onChange={setDestination} />
      <span className={styles.spacer} />
      <Button variant="primary" disabled={busy} onClick={() => void ask()}>
        {t("requests.many.ask", { count: titles.length })}
      </Button>
    </div>
  );
}

import { useInfiniteQuery, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import styles from "../../../features/admin/admin.module.css";
import { ActivityRow, AdminHead } from "../../../features/admin/ui";
import { AccountService } from "../../../gen/laterna/v1/account_pb";
import { ActivityService } from "../../../gen/laterna/v1/activity_pb";
import { Alert } from "../../../ui/Alert";
import { Button } from "../../../ui/Button";
import { Switch } from "../../../ui/Switch";

interface Search {
  /** Only what deserves attention. */
  alerts?: true;
  /** Only what this account did. */
  account?: string;
}

export const Route = createFileRoute("/_app/admin/activity")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(s.alerts ? { alerts: true } : {}),
    ...(typeof s.account === "string" && s.account ? { account: s.account } : {}),
  }),
  component: Activity,
});

/** Activity log (90 days kept by the server), most recent first. */
function Activity() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const accounts = useQuery(AccountService.method.listAccounts, {}).data?.accounts ?? [];
  const activity = useInfiniteQuery(
    ActivityService.method.listActivity,
    { pageSize: 50, warningsOnly: Boolean(search.alerts), accountId: search.account ?? "", pageToken: "" },
    { pageParamKey: "pageToken", getNextPageParam: (last) => last.nextPageToken || undefined },
  );
  const entries = activity.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <>
      <AdminHead title={t("adminActivity.title")} sub={t("adminActivity.subtitle")} />
      <div className={styles.filters}>
        <label className={styles.selectField}>
          <span className={styles.label}>{t("adminActivity.account")}</span>
          <select
            className={styles.input}
            value={search.account ?? ""}
            onChange={(e) =>
              navigate({ search: { ...search, account: e.target.value || undefined }, replace: true })
            }
          >
            <option value="">{t("adminActivity.allAccounts")}</option>
            {accounts.map((s) =>
              s.account ? (
                <option key={s.account.id} value={s.account.id}>
                  {s.account.username}
                </option>
              ) : null,
            )}
          </select>
        </label>
        <Switch
          label={t("adminActivity.alertsOnly")}
          hint={t("adminActivity.alertsHint")}
          on={Boolean(search.alerts)}
          onChange={(on) => navigate({ search: { ...search, alerts: on || undefined }, replace: true })}
        />
      </div>
      <section className={styles.card} aria-label={t("adminActivity.log")}>
        {activity.isError && <Alert>{errorMessage(activity.error)}</Alert>}
        <ul className={styles.activityList}>
          {entries.map((e) => (
            <ActivityRow key={String(e.id)} entry={e} />
          ))}
          {activity.isSuccess && entries.length === 0 && (
            <li className={styles.muted}>{t("common.nothingToShow")}</li>
          )}
        </ul>
        {activity.hasNextPage && (
          <div className={styles.actions}>
            <Button onClick={() => activity.fetchNextPage()} disabled={activity.isFetchingNextPage}>
              {t("common.seeMore")}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}

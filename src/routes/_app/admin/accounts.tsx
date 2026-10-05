import { useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { AccountEditor } from "../../../features/admin/AccountEditor";
import { accountTags } from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead, Tags } from "../../../features/admin/ui";
import { relativeTime } from "../../../features/catalog/format";
import { AccountService } from "../../../gen/laterna/v1/account_pb";
import { LibraryService } from "../../../gen/laterna/v1/library_pb";
import { Alert } from "../../../ui/Alert";
import { profileUniverse } from "../../../ui/Avatar";

interface Search {
  /** Account open in the editor, or "new". */
  account?: string;
}

export const Route = createFileRoute("/_app/admin/accounts")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s.account === "string" ? { account: s.account } : {},
  component: Accounts,
});

/** Accounts: the list on the left, the editor of the chosen account on the right. */
function Accounts() {
  const { t } = useTranslation();
  const { account } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useQuery(AccountService.method.listAccounts, {});
  const libraries = useQuery(LibraryService.method.listLibraries, {}).data?.libraries ?? [];
  const names = new Map(
    libraries.flatMap((l) => (l.library ? [[l.library.id, l.library.name] as const] : [])),
  );
  const accounts = list.data?.accounts ?? [];
  const ids = accounts.map((s) => s.account?.id ?? "");
  const selected = accounts.find((s) => s.account?.id === account);
  const open = (id: string | undefined) => navigate({ search: id ? { account: id } : {}, replace: true });

  return (
    <>
      <AdminHead title={t("adminAccounts.title")} sub={t("adminAccounts.subtitle")}>
        <button type="button" className={styles.dark} onClick={() => open("new")}>
          {t("adminAccounts.new")}
        </button>
      </AdminHead>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      <div className={styles.split}>
        <ul className={styles.accountList}>
          {accounts.map((s) => {
            const a = s.account;
            if (!a) return null;
            const last = s.lastActiveAt ? new Date(Number(s.lastActiveAt.seconds) * 1000) : undefined;
            return (
              <li key={a.id}>
                <Link
                  to="/admin/accounts"
                  search={{ account: a.id }}
                  replace
                  className={styles.accountRow}
                  aria-current={a.id === account ? "page" : undefined}
                  data-disabled={a.disabled || undefined}
                >
                  <span
                    className={styles.initial}
                    data-size="lg"
                    style={{ background: `var(--color-${profileUniverse(ids, a.id)})` }}
                    aria-hidden="true"
                  >
                    {a.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.accountText}>
                    <span className={styles.accountName}>
                      {a.username}
                      <span className={styles.muted}>
                        {[
                          t("adminAccounts.profiles", { count: s.profileCount }),
                          last
                            ? t("adminAccounts.active", { when: relativeTime(last) })
                            : t("adminAccounts.noDevice"),
                          a.id === session.account?.id ? t("adminAccounts.you") : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Tags tags={accountTags(s, names)} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {account === "new" || selected ? (
          <AccountEditor
            key={account}
            summary={selected}
            self={selected?.account?.id === session.account?.id}
            libraries={libraries}
            color={`var(--color-${profileUniverse(ids, selected?.account?.id ?? "")})`}
            onSaved={(id) => open(id)}
            onDeleted={() => open(undefined)}
          />
        ) : (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("adminAccounts.aboutTitle")}</h2>
            <p className={styles.muted}>{t("adminAccounts.aboutText")}</p>
            <p className={styles.muted}>{t("adminAccounts.pick")}</p>
          </section>
        )}
      </div>
    </>
  );
}

import { useTranslation } from "react-i18next";
import { imageUrl } from "../../api/media";
import { type HomeRow, HomeRowKind } from "../../gen/laterna/v1/home_pb";
import i18n, { list } from "../../i18n";
import { useThemeImages } from "../../theme/ServerTheme";
import styles from "./home.module.css";
import { Block, rowFamily } from "./rows";

/** "Good morning" during the day, "Good evening" from 18:00 and at night. */
export function greeting(hour: number): string {
  return hour >= 5 && hour < 18 ? i18n.t("home.greetingDay") : i18n.t("home.greetingEvening");
}

/** Summary under the title: what is in progress and what comes next. */
export function summary(rows: readonly HomeRow[]): string {
  const count = (kind: HomeRowKind) => rows.find((r) => r.kind === kind)?.items.length ?? 0;
  const parts = (
    [
      [HomeRowKind.RESUME, "home.resume"],
      [HomeRowKind.NEXT_UP, "home.nextUp"],
      [HomeRowKind.READING, "home.reading"],
    ] as const
  )
    .filter(([kind]) => count(kind) > 0)
    .map(([kind, key]) => i18n.t(key, { count: count(kind) }));
  if (parts.length === 0) return i18n.t("home.latestOnly");
  return i18n.t("home.summary", { list: list(parts) });
}

/**
 * Home blocks, in the server's order: rows of the same group (rowFamily: in progress, new to watch,
 * recommendations, music, books and photos) form one block with tabs, in place of the first of
 * them. Any other row stands alone.
 */
export function homeBlocks(rows: readonly HomeRow[]): HomeRow[][] {
  const blocks: HomeRow[][] = [];
  const byFamily = new Map<string, HomeRow[]>();
  for (const row of rows) {
    const f = rowFamily(row.kind);
    const block = f === undefined ? undefined : byFamily.get(f);
    if (block) {
      block.push(row);
      continue;
    }
    const created = [row];
    if (f !== undefined) byFamily.set(f, created);
    blocks.push(created);
  }
  return blocks;
}

export function HomeView({
  name,
  rows,
  libraryName,
}: {
  name: string;
  rows: readonly HomeRow[];
  /** Name of a library, for the tabs of recently added. */
  libraryName: (id: string) => string | undefined;
}) {
  const { t } = useTranslation();
  // Background of the server theme: a banner behind the greeting.
  const { background } = useThemeImages();
  return (
    <div className={styles.page} data-ui="home">
      <header
        className={background ? `${styles.intro} ${styles.banner}` : styles.intro}
        style={background ? { backgroundImage: `url("${imageUrl(background, 1920)}")` } : undefined}
        data-ui="home-intro"
      >
        <h1 className={styles.title} data-page-title={t("nav.home")}>
          {greeting(new Date().getHours())} {name}
        </h1>
        <p className={styles.lead}>{summary(rows)}</p>
      </header>
      {rows.length === 0 ? (
        <p className={styles.empty}>{t("home.empty")}</p>
      ) : (
        <div className={styles.rows}>
          {homeBlocks(rows).map((block, i) => (
            <Block
              key={block.map((r) => `${r.kind}-${r.libraryId}`).join(" ")}
              rows={block}
              index={i}
              libraryName={libraryName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Skeleton shown during the first load. */
export function HomeSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={styles.page} role="status" aria-busy="true" aria-label={t("home.loading")}>
      <div className={styles.skeletonTitle} />
      <div className={styles.rows}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    </div>
  );
}

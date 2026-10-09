import { useMutation, useQuery } from "@connectrpc/connect-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../../api/errors";
import { onLibraryScanned } from "../../../api/events";
import { useInvalidate } from "../../../api/invalidate";
import { seconds } from "../../../api/media";
import {
  accountCount,
  ffmpegVersion,
  integrationName,
  integrationState,
  libraryCounts,
  libraryKind,
  playbackMethod,
} from "../../../features/admin/admin";
import styles from "../../../features/admin/admin.module.css";
import { AdminHead, FailedJobs, RecentActivity } from "../../../features/admin/ui";
import { relativeTime } from "../../../features/catalog/format";
import { ActivityService } from "../../../gen/laterna/v1/activity_pb";
import { IntegrationService } from "../../../gen/laterna/v1/integration_pb";
import { LibraryService } from "../../../gen/laterna/v1/library_pb";
import { ServerService } from "../../../gen/laterna/v1/server_pb";
import { SystemService, SystemTask } from "../../../gen/laterna/v1/system_pb";
import { num } from "../../../i18n";
import { Alert } from "../../../ui/Alert";

export const Route = createFileRoute("/_app/admin/")({
  component: Overview,
});

const dateOf = (t: { seconds: bigint } | undefined) => (t ? new Date(Number(t.seconds) * 1000) : undefined);

/** Overview: what is happening, and what needs attention. */
function Overview() {
  const { t } = useTranslation();
  const status = useQuery(SystemService.method.getSystemStatus, {}, { refetchInterval: 5000 }).data?.status;
  const name = useQuery(ServerService.method.getServerInfo, {}).data?.name;
  const playbacks =
    useQuery(ActivityService.method.listPlaybacks, {}, { refetchInterval: 5000 }).data?.playbacks ?? [];
  const devices = useQuery(ActivityService.method.listDevices, {}).data?.devices ?? [];
  const libraries = useQuery(LibraryService.method.listLibraries, {}).data?.libraries ?? [];
  const invalidate = useInvalidate();
  const [notice, setNotice] = useState("");
  const run = useMutation(SystemService.method.runTask, {
    onSuccess: (_, req) => {
      setNotice(req.task === SystemTask.PURGE ? t("settings.purgeDone") : t("settings.scanAllDone"));
      return invalidate(SystemService);
    },
  });

  const started = dateOf(status?.startedAt);
  const transcoded = playbacks.filter((p) => playbackMethod(p).transcoded).length;
  const lastScan = libraries
    .map((l) => dateOf(l.library?.lastScanAt))
    .filter((d): d is Date => d !== undefined)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const accounts = accountCount(devices);

  return (
    <>
      <AdminHead
        title={t("adminOverview.title")}
        sub={[
          name ? t("adminOverview.server", { name }) : "",
          status?.version ? t("adminOverview.version", { version: status.version }) : "",
          status?.commit ? t("adminOverview.commit", { commit: status.commit.slice(0, 7) }) : "",
          started ? t("adminOverview.started", { when: relativeTime(started) }) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        <button
          type="button"
          className={styles.light}
          disabled={run.isPending}
          onClick={() => run.mutate({ task: SystemTask.PURGE })}
        >
          {t("adminOverview.runPurges")}
        </button>
        <button
          type="button"
          className={styles.dark}
          disabled={run.isPending}
          onClick={() => run.mutate({ task: SystemTask.SCAN_LIBRARIES })}
        >
          {t("adminOverview.scanLibraries")}
        </button>
      </AdminHead>
      {run.isError && <Alert>{errorMessage(run.error)}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}

      <div className={styles.kpis}>
        <Kpi
          tone="party"
          n={playbacks.length}
          label={t("adminOverview.playbacks", { count: playbacks.length })}
          sub={
            playbacks.length === 0
              ? t("adminOverview.nobody")
              : transcoded
                ? t("adminOverview.transcodedSome", { count: transcoded })
                : t("adminOverview.transcodedNone")
          }
        />
        <Kpi
          tone="playlists"
          n={devices.length}
          label={t("adminOverview.devices", { count: devices.length })}
          sub={t("adminOverview.onAccounts", { count: accounts })}
        />
        <Kpi
          tone="collections"
          n={libraries.length}
          label={t("adminOverview.libraries", { count: libraries.length })}
          sub={
            lastScan
              ? t("adminOverview.lastScan", { when: relativeTime(lastScan) })
              : t("adminOverview.neverScanned")
          }
        />
        <Kpi
          tone="danger"
          n={status?.jobsFailed ?? 0}
          label={t("adminOverview.failedJobs", { count: status?.jobsFailed ?? 0 })}
          sub={t("adminOverview.jobsQueue", {
            pending: status?.jobsPending ?? 0,
            running: status?.jobsRunning ?? 0,
          })}
        />
      </div>

      {/* Two columns that each stack on their own side: on the left what is happening (playback, libraries, activity), on the right the server's state. Cards of different heights leave no gap, as rows would. */}
      <div className={styles.grid2}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="now-playing">
            <h2 id="now-playing" className={styles.cardTitle}>
              {t("adminOverview.playbacksTitle")}
            </h2>
            <Playbacks />
          </section>
          <section className={styles.card} aria-labelledby="libraries">
            <div className={styles.cardHead}>
              <h2 id="libraries" className={styles.cardTitle}>
                {t("adminOverview.librariesTitle")}
              </h2>
              <Link to="/admin/libraries" className={styles.more}>
                {t("adminOverview.manage")}
              </Link>
            </div>
            <LibraryRows />
          </section>
          <section className={styles.card} aria-labelledby="activity">
            <div className={styles.cardHead}>
              <h2 id="activity" className={styles.cardTitle}>
                {t("adminOverview.activityTitle")}
              </h2>
              <Link to="/admin/activity" className={styles.more}>
                {t("common.seeAll")}
              </Link>
            </div>
            <RecentActivity count={6} />
          </section>
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="server">
            <h2 id="server" className={styles.cardTitle}>
              {t("adminOverview.serverTitle")}
            </h2>
            {status && (
              <dl className={styles.dl}>
                <dt>FFmpeg</dt>
                <dd>
                  {status.ffmpeg
                    ? [
                        t("adminOverview.ffmpegOk", { version: ffmpegVersion(status.ffmpeg) }),
                        status.ffmpegRunning
                          ? t("adminOverview.ffmpegRunning", { count: status.ffmpegRunning })
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : t("adminOverview.ffmpegMissing")}
                </dd>
                <dt>{t("adminOverview.transcodes")}</dt>
                <dd>
                  {t("adminOverview.transcodesValue", { n: status.transcodes, limit: status.transcodeLimit })}
                </dd>
                <dt>{t("adminOverview.encoders")}</dt>
                <dd className={styles.chips}>
                  {status.encoders.map((e, i) => (
                    <span key={e} className={styles.chip} data-first={i === 0 || undefined}>
                      {e}
                    </span>
                  ))}
                </dd>
                <dt>{t("adminOverview.toneMapping")}</dt>
                <dd>{status.toneMappers.join(", ") || t("adminOverview.noToneMapping")}</dd>
                <dt>{t("adminOverview.decoding")}</dt>
                <dd>
                  {status.gpu
                    ? t("adminOverview.decodingGpu")
                    : status.decoder
                      ? t("adminOverview.decodingHardware", { decoder: status.decoder })
                      : t("adminOverview.decodingCpu")}
                </dd>
                <dt>{t("adminOverview.system")}</dt>
                <dd>
                  {status.os} / {status.arch} · {status.goVersion.replace(/^go/, "Go ")}
                </dd>
              </dl>
            )}
          </section>
          <section className={styles.card} aria-labelledby="failures">
            <div className={styles.cardHead}>
              <h2 id="failures" className={styles.cardTitle}>
                {t("adminOverview.failedTitle")}
              </h2>
              <Link to="/admin/tasks" className={styles.more}>
                {t("adminOverview.allTasks")}
              </Link>
            </div>
            <FailedJobs limit={3} />
          </section>
          <section className={styles.card} aria-labelledby="arr">
            <div className={styles.cardHead}>
              <h2 id="arr" className={styles.cardTitle}>
                {t("adminArr.title")}
              </h2>
              <Link to="/admin/sonarr-radarr" className={styles.more}>
                {t("adminOverview.configure")}
              </Link>
            </div>
            <IntegrationSummaries />
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({ tone, n, label, sub }: { tone: string; n: number; label: string; sub: string }) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <span className={styles.kpiN}>{num(n)}</span>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiSub}>{sub}</span>
    </div>
  );
}

/** Who is watching what, where and how; "Stop" ends the playback of any profile. */
function Playbacks() {
  const { t } = useTranslation();
  const list = useQuery(ActivityService.method.listPlaybacks, {}, { refetchInterval: 5000 });
  const invalidate = useInvalidate();
  const end = useMutation(ActivityService.method.endPlayback, {
    onSuccess: () => invalidate(ActivityService),
  });
  const playbacks = list.data?.playbacks ?? [];
  if (list.isSuccess && playbacks.length === 0)
    return <p className={styles.muted}>{t("adminOverview.nobodyWatching")}</p>;
  return (
    <ul className={styles.rows}>
      {end.isError && <Alert>{errorMessage(end.error)}</Alert>}
      {playbacks.map((p) => {
        const method = playbackMethod(p);
        const duration = seconds(p.duration);
        const pct = duration > 0 ? Math.min(100, (seconds(p.position) / duration) * 100) : 0;
        return (
          <li key={p.id} className={styles.play}>
            <span className={styles.initial} aria-hidden="true">
              {(p.profileName || p.username).slice(0, 1).toUpperCase()}
            </span>
            <span className={styles.playText}>
              <span className={styles.playWho}>
                {p.profileName || p.username} · <span className={styles.playWhat}>{p.title}</span>
              </span>
              <span className={styles.playSub}>
                {p.device}
                <span className={styles.method} data-transcoded={method.transcoded || undefined}>
                  {method.label}
                </span>
                {p.transcoding && <span className={styles.muted}>{t("adminOverview.ffmpegWorking")}</span>}
              </span>
              <span className={styles.bar} aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </span>
            </span>
            <button
              type="button"
              className={styles.small}
              disabled={end.isPending}
              onClick={() => end.mutate({ playbackId: p.id })}
              aria-label={t("adminOverview.stopLabel", { name: p.profileName || p.username })}
            >
              {t("adminOverview.stop")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LibraryRows() {
  const { t } = useTranslation();
  const libraries = useQuery(LibraryService.method.listLibraries, {}).data?.libraries ?? [];
  const invalidate = useInvalidate();
  // Scans requested from here, until they finish.
  const [asked, setAsked] = useState<string[]>([]);
  useEffect(
    () => onLibraryScanned((done) => setAsked((ids) => ids.filter((id) => id !== done.libraryId))),
    [],
  );
  const scan = useMutation(LibraryService.method.scanLibrary, {
    onSuccess: (_, req) => {
      setAsked((a) => [...a, req.libraryId ?? ""]);
      return invalidate(SystemService);
    },
  });
  return (
    <ul className={styles.rows}>
      {scan.isError && <Alert>{errorMessage(scan.error)}</Alert>}
      {libraries.map(({ library: l, counts }) => {
        if (!l) return null;
        const k = libraryKind(l.kind);
        const last = dateOf(l.lastScanAt);
        return (
          <li key={l.id} className={styles.libRow}>
            <span className={styles.dot} style={{ background: `var(--color-${k.universe})` }} />
            <span className={styles.libText}>
              <span className={styles.libName}>{l.name}</span>
              <span className={styles.muted}>{libraryCounts(l.kind, counts)}</span>
            </span>
            <span className={styles.muted}>
              {asked.includes(l.id)
                ? t("adminOverview.scanRequested")
                : last
                  ? relativeTime(last)
                  : t("adminOverview.neverScannedOne")}
            </span>
            <button
              type="button"
              className={styles.small}
              disabled={scan.isPending}
              onClick={() => scan.mutate({ libraryId: l.id })}
              aria-label={t("adminOverview.scanLabel", { name: l.name })}
            >
              {t("adminOverview.scan")}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function IntegrationSummaries() {
  const { t } = useTranslation();
  const list = useQuery(IntegrationService.method.listIntegrations, {});
  const invalidate = useInvalidate();
  const fix = useMutation(IntegrationService.method.configureIntegration, {
    onSuccess: () => invalidate(IntegrationService),
  });
  if (list.isPending) return <p className={styles.muted}>{t("adminOverview.querying")}</p>;
  return (
    <ul className={styles.rows}>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      {fix.isError && <Alert>{errorMessage(fix.error)}</Alert>}
      {(list.data?.integrations ?? []).map((i) => {
        const { name, what } = integrationName(i.kind);
        const state = integrationState(i);
        const problems = state.checks.filter((c) => !c.ok);
        return (
          <li key={i.kind} className={styles.arr}>
            <span className={styles.arrHead}>
              <span className={styles.libName}>
                {name}{" "}
                <span className={styles.muted}>
                  {[i.version && `v${i.version}`, what].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={styles.pill} data-tone={state.tone}>
                {state.pill}
              </span>
            </span>
            <span className={styles.muted}>
              {!i.url
                ? t("adminOverview.notLinkedText")
                : problems.length
                  ? problems.map((p) => p.label).join(" ; ")
                  : t("adminOverview.allGood")}
            </span>
            {i.reachable && !i.kodiMetadata && (
              <span>
                <button
                  type="button"
                  className={styles.dark}
                  disabled={fix.isPending}
                  onClick={() => fix.mutate({ kind: i.kind, kodiMetadata: true })}
                >
                  {t("adminOverview.fixSetting")}
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

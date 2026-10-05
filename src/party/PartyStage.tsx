import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { durationOf, formatClock, ImageKind, pickImage, seconds } from "../api/media";
import { episodeCode, languageName } from "../features/catalog/format";
import type { PartyItem } from "../gen/laterna/v1/party_pb";
import { PartyStatus } from "../gen/laterna/v1/party_pb";
import { PlaybackService, type StartPlaybackResponse } from "../gen/laterna/v1/playback_pb";
import i18n from "../i18n";
import { detectDeviceProfile } from "../player/deviceProfile";
import { attachStream, SubtitleLayer } from "../player/media";
import { stopOnUnload } from "../player/stop";
import { Artwork } from "../ui/Artwork";
import { Icon } from "../ui/Icon";
import styles from "./party.module.css";
import { correction, expectedPosition, millis, waitingFor, waitingLabel } from "./sync";
import type { PartySession } from "./useParty";

/** Longest wait (server): latecomers catch up afterwards. */
const maxWait = 15;

/** Title of a queue item. */
export function itemTitle(it: PartyItem | undefined): { title: string; sub: string } {
  switch (it?.item.case) {
    case "movie":
      return {
        title: it.item.value.title,
        sub: it.item.value.year ? String(it.item.value.year) : i18n.t("catalog.movie"),
      };
    case "episode":
      return {
        title: it.item.value.title,
        sub: `${it.item.value.seriesTitle} · ${episodeCode(it.item.value, true)}`,
      };
    case "track":
      return { title: it.item.value.title, sub: it.item.value.artists || it.item.value.artistName };
    default:
      return { title: "", sub: "" };
  }
}

/**
 * This device's playback, in step with the group: each device plays with its own profile
 * (StartPlayback); only the state and the position are shared. Small drift: speed up or slow down a
 * little; large drift: seek.
 */
export function PartyStage({ session }: { session: PartySession }) {
  const { t } = useTranslation();
  const { state, party, me, canControl, control, report, serverNow, reactions } = session;
  const transport = useTransport();
  const playback = useMemo(() => createClient(PlaybackService, transport), [transport]);
  const device = useMemo(detectDeviceProfile, []);
  const video = useRef<HTMLVideoElement>(null);
  const layer = useRef<SubtitleLayer | null>(null);
  const [stream, setStream] = useState<StartPlaybackResponse | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [subtitle, setSubtitle] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Escape closes the subtitle choice and gives focus back to its button (before the party's
  // shortcuts).
  useEffect(() => {
    if (!menu) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [menu]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const meRef = useRef(me);
  meRef.current = me;

  const index = state?.index ?? 0;
  const itemId = state?.queue[index];
  const item = party?.items.find((i) => i.item.value?.id === itemId) ?? party?.items[index];
  const track = item?.item.case === "track" ? item.item.value : undefined;
  const runtime =
    seconds(stream?.duration) ||
    (item?.item.case ? seconds(item.item.value.runtime) : 0) ||
    (video.current && Number.isFinite(video.current.duration) ? video.current.duration : 0);

  // Current item: its playback, at the group's position.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one opening per item.
  useEffect(() => {
    const v = video.current;
    if (!v || !itemId) return;
    let cancelled = false;
    let detach = () => {};
    let opened: StartPlaybackResponse | null = null;
    setLoaded(null);
    setError(null);
    (async () => {
      try {
        const s = await playback.startPlayback({ itemId, device });
        if (cancelled) {
          void playback.stopPlayback({ sessionId: s.sessionId }).catch(() => {});
          return;
        }
        opened = s;
        setStream(s);
        const current = stateRef.current;
        const start = current ? expectedPosition(current, serverNow()) : 0;
        detach = attachStream(v, s, {
          start,
          autoplay: false,
          onLoaded: () => !cancelled && setLoaded(itemId),
          onFatal: setError,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      detach();
      layer.current?.clear();
      if (opened)
        void playback
          .stopPlayback({ sessionId: opened.sessionId, position: durationOf(v.currentTime) })
          .catch(() => {});
    };
  }, [itemId]);

  // Subtitle chosen on this device (only those the browser shows).
  useEffect(() => {
    const v = video.current;
    if (!v || !stream) return;
    layer.current ??= new SubtitleLayer(v);
    const track = stream.subtitles.find((x) => x.index === subtitle);
    void layer.current.show(stream, track, device.subtitleFormats, () => true);
  }, [stream, subtitle, device]);

  // Keeping in step with the group, four times a second.
  useEffect(() => {
    let lastReady = 0;
    const timer = setInterval(() => {
      const v = video.current;
      const s = stateRef.current;
      if (!v || !s || loaded !== itemId) return;
      setTime(v.currentTime);
      const target = expectedPosition(s, serverNow());
      if (s.status === PartyStatus.WAITING) {
        if (!v.paused) v.pause();
        v.playbackRate = 1;
        if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
        // Loaded at the requested position: ready (said again every second while the group waits
        // for it).
        else if (v.readyState >= 3 && !meRef.current?.ready && Date.now() - lastReady > 1000) {
          lastReady = Date.now();
          report({ ready: true });
        }
      } else if (s.status === PartyStatus.PLAYING) {
        const c = correction(target - v.currentTime);
        if (c.seek) v.currentTime = target;
        v.playbackRate = c.rate;
        if (v.paused && !v.ended)
          v.play().then(
            () => setBlocked(false),
            () => setBlocked(true),
          );
      } else {
        if (!v.paused) v.pause();
        v.playbackRate = 1;
        if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
      }
    }, 250);
    return () => clearInterval(timer);
  }, [itemId, loaded, report, serverNow]);

  // Buffering in the middle of playback: the group waits; end of the item: it moves to the next.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onWaiting = () => {
      if (stateRef.current?.status === PartyStatus.PLAYING) report({ buffering: true });
    };
    const onPlaying = () => {
      if (meRef.current?.buffering) report({ buffering: false, ready: true });
    };
    const onEnded = () => {
      const s = stateRef.current;
      if (s) report({ endedIndex: s.index });
    };
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
    };
  }, [report]);

  // This device's history (resume, watched): the position is sent every ten seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      const v = video.current;
      if (stream && v && !v.paused)
        void playback
          .reportProgress({ sessionId: stream.sessionId, position: durationOf(v.currentTime) })
          .catch(() => {});
    }, 10_000);
    const onHide = () => stream && stopOnUnload(stream.sessionId, video.current?.currentTime ?? 0);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
    };
  }, [playback, stream]);

  const status = state?.status ?? PartyStatus.PAUSED;
  const waiting = status === PartyStatus.WAITING;
  // The wait's countdown moves on: one render per half second while it lasts.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [waiting]);
  const behind = waitingFor(state?.members ?? []);
  const elapsed = state ? Math.max(0, (serverNow() - millis(state.at)) / 1000) : 0;
  const left = Math.max(0, Math.ceil(maxWait - elapsed));
  const groupTime = state ? expectedPosition(state, serverNow()) : time;
  const cover = track && pickImage(track.images, ImageKind.POSTER);
  const now = itemTitle(item);

  return (
    <div className={styles.stage} data-ui="party-stage">
      {/* biome-ignore lint/a11y/useMediaCaption: subtitles chosen in the menu (tracks or JASSUB). */}
      <video ref={video} className={styles.video} playsInline />
      {track && (
        <div className={styles.cover}>
          <Artwork
            image={cover}
            sizes="320px"
            ratio={1}
            universe="music"
            fallback={track.title}
            shape="disc"
          />
        </div>
      )}

      <div className={styles.now}>
        <h1 className={styles.nowTitle}>{now.title}</h1>
        <span className={styles.nowSub}>{now.sub}</span>
      </div>

      {waiting && (
        <div className={styles.wait} role="status">
          <span className={styles.ring}>
            <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
              <circle cx="56" cy="56" r="53" className={styles.ringTrack} />
              <circle
                cx="56"
                cy="56"
                r="53"
                className={styles.ringFill}
                strokeDasharray={`${(left / maxWait) * 333} 400`}
                transform="rotate(-90 56 56)"
              />
            </svg>
            {left}
          </span>
          <p className={styles.waitTitle}>{waitingLabel(behind)}</p>
          <p className={styles.waitText}>
            {behind.length === 1
              ? t("party.loadingTheirOne")
              : behind.length > 1
                ? t("party.loadingTheirMany")
                : ""}
            {t("party.restartAt", { time: formatClock(seconds(state?.position)) })}
          </p>
        </div>
      )}

      {blocked && !waiting && (
        <button
          type="button"
          className={styles.unblock}
          onClick={() => void video.current?.play().then(() => setBlocked(false))}
        >
          <Icon name="play" size={18} />
          {t("party.join")}
        </button>
      )}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.reactions} aria-live="polite">
        {reactions.map((r) => (
          <span key={r.key} className={styles.reaction}>
            {r.name}
            <span className={styles.reactionText}>{r.text}</span>
          </span>
        ))}
      </div>

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.play}
          disabled={!canControl}
          title={canControl ? undefined : t("party.hostOnly")}
          aria-label={status === PartyStatus.PLAYING ? t("party.pauseAll") : t("party.playAll")}
          onClick={() =>
            void control(
              status === PartyStatus.PLAYING ? { case: "pause", value: true } : { case: "play", value: true },
            )
          }
        >
          <Icon name={status === PartyStatus.PLAYING ? "pause" : "play"} size={16} />
        </button>
        <button
          type="button"
          className={styles.round}
          disabled={!canControl || index === 0}
          aria-label={t("party.previous")}
          onClick={() => void control({ case: "select", value: index - 1 })}
        >
          <Icon name="skipBack" size={14} />
        </button>
        <button
          type="button"
          className={styles.round}
          disabled={!canControl || index + 1 >= (state?.queue.length ?? 0)}
          aria-label={t("party.next")}
          onClick={() => void control({ case: "select", value: index + 1 })}
        >
          <Icon name="skipForward" size={14} />
        </button>
        <span className={styles.track}>
          <span
            className={styles.fill}
            style={{ width: `${runtime > 0 ? Math.min(100, (groupTime / runtime) * 100) : 0}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(runtime))}
            value={Math.floor(groupTime)}
            disabled={!canControl}
            aria-label={t("party.position")}
            aria-valuetext={t("player.positionText", {
              time: formatClock(groupTime),
              total: formatClock(runtime),
            })}
            onChange={(e) => void control({ case: "seek", value: durationOf(Number(e.target.value)) })}
          />
        </span>
        <span className={styles.time}>
          {formatClock(groupTime)} <span className={styles.total}>/ {formatClock(runtime)}</span>
        </span>
        {stream && stream.subtitles.length > 0 && (
          <div className={styles.subMenu}>
            <button
              ref={menuButton}
              type="button"
              className={styles.round}
              aria-expanded={menu}
              aria-label={t("player.subtitles")}
              onClick={() => setMenu((o) => !o)}
            >
              <Icon name="subtitles" size={16} />
            </button>
            {menu && (
              <fieldset className={styles.subList}>
                <legend className="sr-only">{t("player.subtitles")}</legend>
                {[
                  { index: null as number | null, label: t("player.none") },
                  ...stream.subtitles.map((s) => ({
                    index: s.index as number | null,
                    label:
                      languageName(s.language) || s.title || t("player.subtitleTrack", { n: s.index + 1 }),
                  })),
                ].map((o) => (
                  <button
                    key={String(o.index)}
                    type="button"
                    aria-pressed={subtitle === o.index}
                    className={styles.subItem}
                    onClick={() => {
                      setSubtitle(o.index);
                      setMenu(false);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </fieldset>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

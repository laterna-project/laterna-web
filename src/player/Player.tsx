import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { Link, type LinkProps, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../api/errors";
import { durationOf, formatClock, mediaUrl, seconds } from "../api/media";
import {
  channelsLabel,
  codecName,
  fileSize,
  languageName,
  resolutionLabel,
} from "../features/catalog/format";
import { type Image, type MediaFile, MediaSegmentKind, StreamKind } from "../gen/laterna/v1/catalog_pb";
import {
  PlaybackMethod,
  PlaybackService,
  type StartPlaybackResponse,
  type SubtitleTrack,
} from "../gen/laterna/v1/playback_pb";
import i18n from "../i18n";
import { StartParty } from "../party/StartParty";
import type { Universe } from "../theme/contract";
import { barColor } from "../theme/theme";
import { Artwork } from "../ui/Artwork";
import { Icon } from "../ui/Icon";
import { Status } from "../ui/Status";
import { usePanelFocus } from "../ui/usePanelFocus";
import { canSwitchAudioTracks, detectDeviceProfile, withoutDirectVideo } from "./deviceProfile";
import { canFullscreen, enterFullscreen, exitFullscreen } from "./fullscreen";
import {
  autoSkippable,
  chapterAt,
  chapterSpans,
  defaultAudioIndex,
  methodSummary,
  passageAt,
  passageName,
  passages,
  skipLabel,
  skippedMessage,
  subtitleMode,
  trickplayTile,
} from "./logic";
import { attachStream, SubtitleLayer } from "./media";
import styles from "./player.module.css";
import { stopOnUnload } from "./stop";

export interface PlayerProps {
  itemId: string;
  universe: Universe;
  /** Small tag ("S1 · E3", "Movie"), title and subtitle of the header. */
  badge: string;
  title: string;
  subtitle: string;
  files: readonly MediaFile[];
  /** Forced start position ("From the beginning"); otherwise the profile's resume position. */
  start?: number;
  back: LinkProps;
  /**
   * What comes next: its title ("S1 · E2 · Gran Dillama"), its play link, and what it is ("Next
   * episode" by default, "Next in the playlist").
   */
  next?: { title: string; link: LinkProps; label?: string; image?: Image };
  /** Episodes of the series, in order ("Episodes" panel); absent for a movie. */
  episodes?: readonly { id: string; label: string; title: string }[];
}

interface Choice {
  fileId?: string;
  audio?: number;
  /** Chosen subtitle (SubtitleTrack.index), null for none. */
  subtitle: number | null;
}

const volumeKey = "laterna.volume";
// Intros and recaps skipped automatically ("Always skip"), on this device.
const autoSkipKey = "laterna.player.always-skip";
const savedAutoSkip = () => {
  try {
    return localStorage.getItem(autoSkipKey) === "1";
  } catch {
    return false;
  }
};
const savedVolume = () => {
  try {
    const v = Number(localStorage.getItem(volumeKey));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
};

/** Full-screen video player: a movie or an episode, with everything the server can do. */
export function Player(p: PlayerProps) {
  const transport = useTransport();
  const playback = useMemo(() => createClient(PlaybackService, transport), [transport]);
  const { t } = useTranslation();
  const profile = useMemo(detectDeviceProfile, []);
  const navigate = useNavigate();

  const stage = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Detaches the current stream (hls.js); subtitles shown by the browser.
  const detach = useRef<(() => void) | null>(null);
  const layer = useRef<SubtitleLayer | null>(null);
  const current = useRef<StartPlaybackResponse | null>(null);
  // Number of the last opening: a response that arrives after another request is dropped.
  const generation = useRef(0);
  // Last position played: on unmount, the <video> element is already gone.
  const position = useRef(0);
  const preloaded = useRef<unknown>(null);

  const [session, setSession] = useState<StartPlaybackResponse | null>(null);
  // HLS stream requested for another audio track (see open): to be said in the information panel.
  const [audioViaHls, setAudioViaHls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>({ subtitle: null });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(savedVolume);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<"audio" | "episodes" | null>(null);
  const panelRef = usePanelFocus<HTMLElement>(panel, () => setPanel(null));
  const togglePanel = (which: "audio" | "episodes") => setPanel((o) => (o === which ? null : which));
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState<{ x: number; position: number } | null>(null);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [autoSkip, setAutoSkip] = useState(savedAutoSkip);
  // Announcement of a segment skipped automatically; end credits whose next item was declined.
  const [skipped, setSkipped] = useState("");
  const [creditsDismissed, setCreditsDismissed] = useState(false);
  const [creditsLeft, setCreditsLeft] = useState(10);

  const files = p.files;
  const file = files.find((f) => f.id === session?.fileId) ?? p.files[0];
  const total = duration || seconds(session?.duration) || seconds(file?.duration);
  const chapters = useMemo(() => chapterSpans(file?.chapters ?? [], total), [file, total]);
  // Segments to skip: those of the open playback, otherwise those of the file's details.
  const skips = useMemo(
    () => passages(session?.segments.length ? session.segments : (file?.segments ?? [])),
    [session, file],
  );
  const passage = passageAt(skips, time);
  const upNext = passage?.kind === MediaSegmentKind.CREDITS && Boolean(p.next) && !creditsDismissed && !ended;

  // --- Subtitles shown by the browser ---------------------------------------------------------

  const subtitles = useCallback(() => {
    if (!layer.current && video.current) layer.current = new SubtitleLayer(video.current);
    return layer.current;
  }, []);
  const clearSubtitles = useCallback(() => subtitles()?.clear(), [subtitles]);
  const showSubtitle = useCallback(
    (s: StartPlaybackResponse, track: SubtitleTrack | undefined) =>
      subtitles()?.show(s, track, profile.subtitleFormats, () => current.current === s),
    [profile, subtitles],
  );

  // --- Opening a playback ---------------------------------------------------------------------

  const stopSession = useCallback(
    (position: number) => {
      const s = current.current;
      current.current = null;
      if (!s) return;
      void playback.stopPlayback({ sessionId: s.sessionId, position: durationOf(position) }).catch(() => {});
    },
    [playback],
  );

  const open = useCallback(
    // first: the opening of the playback, which takes the subtitle the profile prefers (server:
    // docs/design/subtitles.md); the viewer's later choices are kept as they are.
    async (next: Choice, start: number | undefined, first = false) => {
      const v = video.current;
      if (!v) return;
      const gen = ++generation.current;
      const at = v.currentTime;
      detach.current?.();
      detach.current = null;
      clearSubtitles();
      if (current.current) stopSession(at);
      setError(null);
      setEnded(false);
      try {
        const subtitleTrack = session?.subtitles.find((t) => t.index === next.subtitle);
        const burn = subtitleTrack && subtitleMode(subtitleTrack, profile.subtitleFormats).kind === "burn";
        // An audio track other than the default: without audioTracks (every browser but Safari),
        // the browser would only play the default one of a file played directly; the server then
        // makes an HLS stream with the right one.
        const target = files.find((f) => f.id === (next.fileId ?? session?.fileId)) ?? files[0];
        const otherAudio = next.audio !== undefined && next.audio !== defaultAudioIndex(target);
        const switchAudio = otherAudio && canSwitchAudioTracks();
        const s = await playback.startPlayback({
          itemId: p.itemId,
          fileId: next.fileId ?? "",
          audioStreamIndex: next.audio,
          subtitleIndex: burn ? (next.subtitle ?? undefined) : undefined,
          profileSubtitle: first,
          device: otherAudio && !switchAudio ? withoutDirectVideo(profile) : profile,
        });
        if (gen !== generation.current) {
          void playback.stopPlayback({ sessionId: s.sessionId }).catch(() => {});
          return;
        }
        current.current = s;
        setSession(s);
        setAudioViaHls(otherAudio && !switchAudio && s.method !== PlaybackMethod.DIRECT);
        const shown = first ? (s.subtitleIndex ?? null) : next.subtitle;
        const burned = shown !== null && s.burnedSubtitleIndex === shown;
        setChoice({ ...next, subtitle: shown, fileId: s.fileId, audio: s.audioStreamIndex });
        const from = start ?? seconds(s.resumePosition);
        detach.current = attachStream(v, s, {
          start: from,
          autoplay: true,
          onLoaded: () => {
            if (switchAudio) selectAudioTrack(v, target, s.audioStreamIndex);
          },
          onFatal: setError,
        });
        // Subtitle shown by the browser: put it back; burned in: nothing to do.
        if (!burned)
          void showSubtitle(
            s,
            s.subtitles.find((t) => t.index === shown),
          );
        // File just added: the list of subtitles arrives when extraction ends.
        if (!s.subtitlesReady) {
          const res = await playback.getSubtitles({ sessionId: s.sessionId, wait: true }).catch(() => null);
          if (res && current.current === s) {
            const ready = {
              ...s,
              subtitles: res.subtitles,
              fonts: res.fonts,
              subtitlesReady: res.subtitlesReady,
            };
            current.current = ready;
            setSession(ready);
            // A subtitle picked before extraction ended: its files are there now.
            if (shown !== null && !burned)
              void showSubtitle(
                ready,
                ready.subtitles.find((t) => t.index === shown),
              );
          }
        }
      } catch (err) {
        if (gen === generation.current) setError(errorMessage(err));
      }
    },
    [clearSubtitles, files, p.itemId, playback, profile, session, showSubtitle, stopSession],
  );

  // First opening (once per item), closing when leaving.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a single opening per item played.
  useEffect(() => {
    void open({ subtitle: null }, p.start, true);
    const onUnload = () => {
      const s = current.current;
      if (s) stopOnUnload(s.sessionId, position.current);
      current.current = null;
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      generation.current++;
      stopSession(position.current);
      detach.current?.();
      detach.current = null;
      clearSubtitles();
    };
  }, [p.itemId]);

  // Position reported every ten seconds while playing, and at each pause.
  useEffect(() => {
    const report = () => {
      const s = current.current;
      const v = video.current;
      if (s && v && v.currentTime > 0)
        void playback
          .reportProgress({
            sessionId: s.sessionId,
            position: durationOf(v.currentTime),
          })
          .catch(() => {});
    };
    const timer = setInterval(() => {
      if (video.current && !video.current.paused) report();
    }, 10_000);
    const v = video.current;
    v?.addEventListener("pause", report);
    return () => {
      clearInterval(timer);
      v?.removeEventListener("pause", report);
    };
  }, [playback]);

  // --- Video state ----------------------------------------------------------------------------

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = volume;
    const on = (name: string, fn: () => void) => {
      v.addEventListener(name, fn);
      return () => v.removeEventListener(name, fn);
    };
    const offs = [
      on("play", () => setPlaying(true)),
      on("pause", () => setPlaying(false)),
      on("timeupdate", () => {
        position.current = v.currentTime;
        setTime(v.currentTime);
      }),
      on("durationchange", () => setDuration(Number.isFinite(v.duration) ? v.duration : 0)),
      on("progress", () => setBuffered(v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0)),
      on("volumechange", () => {
        setMuted(v.muted);
        setVolume(v.volume);
        try {
          localStorage.setItem(volumeKey, String(v.volume));
        } catch {
          // Volume kept for this visit only.
        }
      }),
      on("ended", () => setEnded(true)),
      on("waiting", () => setWaiting(true)),
      on("loadstart", () => setWaiting(true)),
      on("playing", () => setWaiting(false)),
      on("canplay", () => setWaiting(false)),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [volume]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  // The bars of the browser and of the installed app around the dark stage.
  useEffect(() => barColor("--color-stage"), []);

  // WebVTT subtitles moved up above the controls while they are shown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: <track> changes with the chosen subtitle.
  useEffect(() => {
    const el = video.current?.querySelector("track");
    if (!el) return;
    const place = () => {
      for (const c of Array.from(el.track.cues ?? [])) if (c instanceof VTTCue) c.line = idle ? "auto" : -4;
    };
    place();
    el.addEventListener("load", place);
    return () => el.removeEventListener("load", place);
  }, [idle, choice.subtitle]);

  // Controls hidden after three seconds without moving, while playing.
  useEffect(() => {
    if (!playing || panel || hover) {
      setIdle(false);
      return;
    }
    let timer = setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    const el = stage.current;
    el?.addEventListener("pointermove", wake);
    el?.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener("pointermove", wake);
      el?.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [playing, panel, hover]);

  // End of an episode: the next one after ten seconds, unless cancelled. The link is read again at
  // each render (the episode list reloads) without restarting the countdown.
  const nextLink = useRef(p.next?.link);
  nextLink.current = p.next?.link;
  const hasNext = Boolean(p.next);
  useEffect(() => {
    if (!ended || !hasNext) return;
    setCountdown(10);
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [ended, hasNext]);
  useEffect(() => {
    if (ended && countdown <= 0 && nextLink.current) void navigate(nextLink.current);
  }, [countdown, ended, navigate]);

  // End credits: what comes next is offered, and started after ten seconds of playback.
  useEffect(() => {
    if (upNext) setCreditsLeft(10);
  }, [upNext]);
  useEffect(() => {
    if (!upNext || !playing) return;
    const timer = setInterval(() => setCreditsLeft((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [upNext, playing]);
  useEffect(() => {
    if (upNext && creditsLeft <= 0 && nextLink.current) void navigate(nextLink.current);
  }, [upNext, creditsLeft, navigate]);

  // --- Controls -------------------------------------------------------------------------------

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);
  const seek = useCallback(
    (to: number) => {
      const v = video.current;
      if (v) v.currentTime = Math.max(0, Math.min(total || v.duration || 0, to));
    },
    [total],
  );
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) exitFullscreen();
    else if (stage.current && video.current) enterFullscreen(stage.current, video.current);
  }, []);

  const rememberAutoSkip = (on: boolean) => {
    setAutoSkip(on);
    try {
      if (on) localStorage.setItem(autoSkipKey, "1");
      else localStorage.removeItem(autoSkipKey);
    } catch {
      // Storage unavailable: the choice lasts for this playback.
    }
  };
  // "Always skip": intro and recap skipped once each; seeking back into them by hand shows them.
  const autoSkipped = useRef(new Set<number>());
  useEffect(() => {
    if (!autoSkip || !playing || !passage || !autoSkippable(passage.kind)) return;
    if (autoSkipped.current.has(passage.start)) return;
    autoSkipped.current.add(passage.start);
    seek(passage.end);
    setSkipped(skippedMessage(passage.kind));
  }, [autoSkip, playing, passage, seek]);
  useEffect(() => {
    if (!skipped) return;
    const timer = setTimeout(() => setSkipped(""), 6000);
    return () => clearTimeout(timer);
  }, [skipped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inControl = target?.closest("button, input, select, a");
      const v = video.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          if (inControl) return;
          e.preventDefault();
          toggle();
          break;
        case "k":
          toggle();
          break;
        case "ArrowLeft":
        case "j":
          if (inControl && e.key === "ArrowLeft") return;
          seek(v.currentTime - 10);
          break;
        case "ArrowRight":
        case "l":
          if (inControl && e.key === "ArrowRight") return;
          seek(v.currentTime + 10);
          break;
        case "ArrowUp":
          if (inControl) return;
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          if (inControl) return;
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "f":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, toggle, toggleFullscreen]);

  const chooseSubtitle = (index: number | null) => {
    const s = session;
    if (!s) return;
    const track = s.subtitles.find((t) => t.index === index);
    const needsServer =
      (track && subtitleMode(track, profile.subtitleFormats).kind === "burn") ||
      s.burnedSubtitleIndex !== undefined;
    if (needsServer) void open({ ...choice, subtitle: index }, video.current?.currentTime);
    else {
      setChoice({ ...choice, subtitle: index });
      void showSubtitle(s, track);
    }
  };

  // --- Rendering ------------------------------------------------------------------------------

  const audioTracks = (file?.streams ?? []).filter((s) => s.kind === StreamKind.AUDIO);
  const method = session
    ? audioViaHls && session.method === PlaybackMethod.HLS_REMUX
      ? {
          title: methodSummary(session).title,
          detail: t("player.method.audioViaHls"),
        }
      : methodSummary(session)
    : null;
  const trickplay = file?.trickplay;
  const tile = hover && trickplay ? trickplayTile(trickplay, hover.position) : null;
  // Thumbnail reduced to 240 px wide at most: the whole sheet is scaled.
  const scale = tile ? Math.min(1, 240 / tile.width) : 1;
  const hoverChapter = hover ? chapterAt(chapters, hover.position) : undefined;
  const hoverPassage = hover ? passageAt(skips, hover.position) : undefined;
  // Universe color (movies, series): fill of the bar and main action.
  const accent = { background: `var(--color-${p.universe})`, color: `var(--color-${p.universe}-ink)` };

  return (
    <main ref={stage} className={styles.stage} data-idle={idle} data-ui="player">
      {/* biome-ignore lint/a11y/useMediaCaption: subtitles are added on demand (tracks or JASSUB). */}
      <video
        ref={video}
        className={styles.video}
        playsInline
        onClick={(e) => {
          // With a finger, touching the picture shows the controls (pointerdown) without pausing.
          if ((e.nativeEvent as PointerEvent).pointerType !== "touch") toggle();
        }}
        onDoubleClick={toggleFullscreen}
      />

      <header className={styles.top} data-ui="player-top">
        <Link {...p.back} className={styles.round} aria-label={t("player.back")}>
          <Icon name="back" />
        </Link>
        <div className={styles.heading}>
          <span className={styles.badge} style={accent}>
            {p.badge}
          </span>
          <h1 className={styles.title}>{p.title}</h1>
          {p.subtitle && <span className={styles.subtitle}>{p.subtitle}</span>}
        </div>
      </header>
      <StartParty itemIds={[p.itemId]} className={styles.party}>
        <Icon name="people" size={18} />
        {t("player.together")}
      </StartParty>

      {error && (
        <div className={styles.message} role="alert">
          <p className={styles.messageTitle}>{t("player.error")}</p>
          <p>{error}</p>
          <Link {...p.back} className={styles.pill}>
            {t("player.back")}
          </Link>
        </div>
      )}

      {waiting && !error && !ended && (
        <span className={styles.spinner} role="status" aria-label={t("player.loading")} />
      )}
      {!playing && !waiting && !error && !ended && session && (
        <button type="button" className={styles.bigPlay} onClick={toggle} aria-label={t("player.play")}>
          <Icon name="play" size={34} />
        </button>
      )}

      {passage && skipLabel(passage.kind) && !ended && (
        <div className={styles.skipZone}>
          <button
            type="button"
            className={styles.skip}
            style={{ boxShadow: `0 0 0 3px ${accent.background}, var(--shadow-floating)` }}
            onClick={() => seek(passage.end)}
          >
            <Icon name="skip" size={18} />
            {skipLabel(passage.kind)}
          </button>
          {autoSkippable(passage.kind) && !autoSkip && (
            <button type="button" className={styles.skipAlways} onClick={() => rememberAutoSkip(true)}>
              {t("player.alwaysSkip")}
            </button>
          )}
        </div>
      )}
      <div className={styles.skipped}>
        <Status className={styles.skippedText} message={skipped} />
        {skipped && autoSkip && (
          <button
            type="button"
            className={styles.skipAlways}
            onClick={() => {
              rememberAutoSkip(false);
              setSkipped("");
            }}
          >
            {t("player.stopAutoSkip")}
          </button>
        )}
      </div>
      {upNext && p.next && (
        <section
          className={styles.upNext}
          style={accent}
          aria-label={p.next.label ?? t("player.nextEpisode")}
        >
          {p.next.image && (
            <Artwork
              image={p.next.image}
              sizes="200px"
              ratio={16 / 9}
              universe={p.universe}
              className={styles.upNextThumb}
            />
          )}
          <span className={styles.upNextText}>
            <span className={styles.upNextLabel}>{p.next.label ?? t("player.nextEpisode")}</span>
            <span className={styles.upNextTitle}>{p.next.title}</span>
            <span className={styles.upNextActions}>
              <Link {...p.next.link} className={styles.upNextPlay}>
                <Icon name="play" size={12} />
                {t("player.playNow")}
              </Link>
              <button type="button" className={styles.upNextStay} onClick={() => setCreditsDismissed(true)}>
                {t("player.watchCredits")}
              </button>
            </span>
          </span>
          <span
            className={styles.ring}
            role="timer"
            aria-label={t("player.inSeconds", { n: Math.max(0, creditsLeft) })}
          >
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="28" className={styles.ringTrack} />
              <circle
                cx="32"
                cy="32"
                r="28"
                className={styles.ringFill}
                strokeDasharray={`${(Math.max(0, creditsLeft) / 10) * 176} 200`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span aria-hidden="true">{Math.max(0, creditsLeft)}</span>
          </span>
        </section>
      )}

      {ended && (
        <div className={styles.message}>
          {p.next ? (
            <>
              <p className={styles.messageTitle}>
                {t("player.nextIn", {
                  label: p.next.label ?? t("player.nextEpisode"),
                  n: Math.max(0, countdown),
                })}
              </p>
              <p>{p.next.title}</p>
              <div className={styles.row}>
                <Link {...p.next.link} className={styles.pill} style={accent}>
                  {t("player.playNow")}
                </Link>
                <Link {...p.back} className={styles.pill}>
                  {t("player.back")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className={styles.messageTitle}>{t("player.finished")}</p>
              <Link {...p.back} className={styles.pill}>
                {t("player.back")}
              </Link>
            </>
          )}
        </div>
      )}

      {panel === "audio" && session && (
        <aside
          id="audio-subtitles"
          ref={panelRef}
          className={styles.panel}
          data-ui="player-panel"
          aria-label={t("player.audioSubtitles")}
        >
          <p className={styles.panelTitle}>{t("player.audioSubtitles")}</p>
          {audioTracks.length > 1 && (
            <Group title={t("player.audio")}>
              {audioTracks.map((a) => (
                <Option
                  tone={accent}
                  key={a.index}
                  on={a.index === session.audioStreamIndex}
                  label={languageName(a.language) || a.title || t("player.track", { n: a.index })}
                  sub={[codecName(a.codec), channelsLabel(a.channels), a.default ? t("player.default") : ""]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => void open({ ...choice, audio: a.index }, video.current?.currentTime)}
                />
              ))}
            </Group>
          )}
          <Group title={t("player.subtitles")}>
            <Option
              tone={accent}
              on={choice.subtitle === null}
              label={t("player.none")}
              sub={t("player.off")}
              onClick={() => chooseSubtitle(null)}
            />
            {session.subtitles.map((st) => (
              <Option
                tone={accent}
                key={st.index}
                on={choice.subtitle === st.index || session.burnedSubtitleIndex === st.index}
                label={
                  languageName(st.language) || st.title || t("player.subtitleTrack", { n: st.index + 1 })
                }
                sub={subtitleSub(st, profile.subtitleFormats)}
                onClick={() => chooseSubtitle(st.index)}
              />
            ))}
            {!session.subtitlesReady && <p className={styles.note}>{t("player.extracting")}</p>}
          </Group>
          {p.files.length > 1 && (
            <Group title={t("player.version")}>
              {p.files.map((f) => {
                const v = f.streams.find((s) => s.kind === StreamKind.VIDEO);
                return (
                  <Option
                    tone={accent}
                    key={f.id}
                    on={f.id === session.fileId}
                    label={f.version || (v ? resolutionLabel(v.width, v.height) : f.container.toUpperCase())}
                    sub={[f.container.toUpperCase(), fileSize(f.size)].join(" · ")}
                    onClick={() => void open({ ...choice, fileId: f.id }, video.current?.currentTime)}
                  />
                );
              })}
            </Group>
          )}
          {method?.title && (
            <div className={styles.method}>
              {/* Check mark when picture and sound are original; information when the server transcodes. */}
              <span
                className={styles.methodMark}
                data-tone={session.method === PlaybackMethod.HLS_TRANSCODE ? "warn" : undefined}
                aria-hidden="true"
              >
                <Icon name={session.method === PlaybackMethod.HLS_TRANSCODE ? "info" : "check"} size={14} />
              </span>
              <span className={styles.methodText}>
                <span className={styles.methodTitle}>{method.title}</span>
                {method.detail && <span className={styles.methodDetail}>{method.detail}</span>}
              </span>
            </div>
          )}
        </aside>
      )}

      {panel === "episodes" && p.episodes && (
        <aside
          id="episodes"
          ref={panelRef}
          className={styles.panel}
          aria-label={t("player.episodes")}
          data-ui="player-panel"
        >
          <p className={styles.panelTitle}>{t("player.episodes")}</p>
          <ol className={styles.episodes}>
            {p.episodes.map((e) => (
              <li key={e.id}>
                <Link to="/play/episode/$id" params={{ id: e.id }} className={styles.episode}>
                  <span className={styles.episodeLabel}>{e.label}</span>
                  <span className={styles.episodeTitle}>{e.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      )}

      <div className={styles.bottom} data-ui="player-bottom">
        <div
          className={styles.bar}
          data-ui="seek"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
            setHover({ x, position: (x / r.width) * total });
          }}
          onPointerEnter={() => {
            // Sheets loaded as the pointer nears the bar: the thumbnail is there on first hover.
            if (!trickplay || preloaded.current === trickplay) return;
            preloaded.current = trickplay;
            for (const sheet of trickplay.sheets) new Image().src = mediaUrl(sheet);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {total > 0 &&
            skips.map((s) => (
              <span
                key={`${s.kind}-${s.start}`}
                className={styles.passage}
                style={{
                  left: `${(s.start / total) * 100}%`,
                  width: `${((s.end - s.start) / total) * 100}%`,
                }}
                aria-hidden="true"
              />
            ))}
          {chapters.map((c) => (
            <span
              key={`${c.start}`}
              className={styles.segment}
              style={{ flexGrow: Math.max(1, c.end - c.start) }}
            >
              <span className={styles.buffered} style={{ width: `${fill(buffered, c)}%` }} />
              <span
                className={styles.played}
                style={{ width: `${fill(time, c)}%`, background: accent.background }}
              />
            </span>
          ))}
          <span
            className={styles.knob}
            style={{ left: `${total > 0 ? (time / total) * 100 : 0}%`, borderColor: accent.background }}
            aria-hidden="true"
          />
          <input
            className={styles.range}
            type="range"
            min={0}
            max={Math.max(1, Math.floor(total))}
            step={1}
            value={Math.floor(time)}
            aria-label={t("player.position")}
            aria-valuetext={t("player.positionText", { time: formatClock(time), total: formatClock(total) })}
            onChange={(e) => seek(Number(e.target.value))}
          />
          {hover && (
            <span className={styles.preview} style={{ left: `${hover.x}px` }}>
              {tile && (
                <span
                  className={styles.thumb}
                  style={{
                    width: tile.width * scale,
                    height: tile.height * scale,
                    backgroundImage: `url(${mediaUrl(tile.sheet)})`,
                    backgroundSize: `${(trickplay?.columns ?? 1) * tile.width * scale}px auto`,
                    backgroundPosition: `-${tile.x * scale}px -${tile.y * scale}px`,
                  }}
                />
              )}
              <span className={styles.previewText}>
                <span className={styles.previewTime}>{formatClock(hover.position)}</span>
                {(hoverPassage || hoverChapter?.title) && (
                  <span className={styles.previewChapter}>
                    {hoverPassage ? passageName(hoverPassage.kind) : hoverChapter?.title}
                  </span>
                )}
              </span>
            </span>
          )}
        </div>
        <div className={styles.controls} data-ui="player-controls">
          <button
            type="button"
            className={styles.play}
            onClick={toggle}
            aria-label={playing ? t("player.pause") : t("player.play")}
          >
            <Icon name={playing ? "pause" : "play"} size={20} />
          </button>
          <button
            type="button"
            className={styles.round}
            onClick={() => seek(time - 10)}
            aria-label={t("player.back10")}
          >
            <Icon name="replay" size={20} />
            <span className={styles.ten}>10</span>
          </button>
          <button
            type="button"
            className={styles.round}
            onClick={() => seek(time + 10)}
            aria-label={t("player.forward10")}
          >
            <Icon name="forward" size={20} />
            <span className={styles.ten}>10</span>
          </button>
          {p.next && (
            <Link {...p.next.link} className={styles.pill} title={p.next.title}>
              {p.next.label ?? t("player.nextEpisode")}
            </Link>
          )}
          <span className={styles.time}>
            {formatClock(time)} <span className={styles.total}>/ {formatClock(total)}</span>
          </span>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.round}
            onClick={() => {
              if (video.current) video.current.muted = !muted;
            }}
            aria-label={muted ? t("player.unmute") : t("player.mute")}
          >
            <Icon name={muted || volume === 0 ? "mute" : "volume"} size={20} />
          </button>
          <input
            className={styles.volume}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label={t("player.volume")}
            onChange={(e) => {
              if (!video.current) return;
              video.current.muted = false;
              video.current.volume = Number(e.target.value);
            }}
          />
          <button
            type="button"
            className={styles.pill}
            aria-expanded={panel === "audio"}
            aria-controls="audio-subtitles"
            style={panel === "audio" ? accent : undefined}
            onClick={() => togglePanel("audio")}
          >
            <Icon name="subtitles" size={18} />
            {t("player.audioSubtitles")}
          </button>
          {p.episodes && p.episodes.length > 1 && (
            <button
              type="button"
              className={styles.pill}
              aria-expanded={panel === "episodes"}
              aria-controls="episodes"
              style={panel === "episodes" ? accent : undefined}
              onClick={() => togglePanel("episodes")}
            >
              {t("player.episodes")}
            </button>
          )}
          {canFullscreen() && (
            <button
              type="button"
              className={styles.round}
              onClick={toggleFullscreen}
              aria-label={fullscreen ? t("player.exitFullscreen") : t("player.fullscreen")}
            >
              <Icon name={fullscreen ? "shrink" : "expand"} size={20} />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.groupTitle}>{title}</legend>
      <div className={styles.options}>{children}</div>
    </fieldset>
  );
}

function Option({
  on,
  label,
  sub,
  tone,
  onClick,
}: {
  on: boolean;
  label: string;
  sub: string;
  /** Universe colors, set on the chosen option. */
  tone: CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.option}
      aria-pressed={on}
      style={on ? tone : undefined}
      onClick={onClick}
    >
      <span className={styles.optionLabel}>{label}</span>
      {sub && <span className={styles.optionSub}>{sub}</span>}
    </button>
  );
}

function subtitleSub(st: SubtitleTrack, formats: readonly string[]): string {
  const mode = subtitleMode(st, formats);
  const t = i18n.t;
  return [
    st.title && st.title !== languageName(st.language) ? st.title : "",
    st.forced ? t("player.forced") : "",
    st.hearingImpaired ? t("player.hearingImpaired") : "",
    mode.kind === "ass"
      ? t("player.originalStyles")
      : mode.kind === "burn"
        ? t("player.burned")
        : codecName(st.codec),
    st.external ? t("player.external") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Share of a segment already reached by a position, in percent. */
function fill(position: number, s: { start: number; end: number }): number {
  if (position <= s.start) return 0;
  if (position >= s.end) return 100;
  return ((position - s.start) / (s.end - s.start)) * 100;
}

/** Safari: enables the chosen audio track in a file played directly (same order as the file). */
function selectAudioTrack(v: HTMLVideoElement, file: MediaFile | undefined, index: number | undefined) {
  const tracks = (v as HTMLVideoElement & { audioTracks?: ArrayLike<{ enabled: boolean }> }).audioTracks;
  const position = (file?.streams ?? [])
    .filter((x) => x.kind === StreamKind.AUDIO)
    .findIndex((x) => x.index === index);
  if (!tracks || position < 0) return;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t) t.enabled = i === position;
  }
}

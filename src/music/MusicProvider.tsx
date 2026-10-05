import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { useTransport } from "@connectrpc/connect-query";
import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessage } from "../api/errors";
import { durationOf, ImageKind, imageUrl, mediaUrl, pickImage } from "../api/media";
import { type Track, TrackSchema } from "../gen/laterna/v1/catalog_pb";
import { PlaybackService, type StartPlaybackResponse } from "../gen/laterna/v1/playback_pb";
import i18n from "../i18n";
import { detectDeviceProfile } from "../player/deviceProfile";
import { stopOnUnload } from "../player/stop";
import {
  advance,
  append,
  back,
  currentTrack,
  emptyQueue,
  type GainMode,
  type GainSetting,
  gainFactor,
  gainModeFor,
  jump,
  playNext,
  type Queue,
  type Repeat,
  removeAt,
  startQueue,
  toggleShuffle,
} from "./queue";

export interface Music {
  queue: Queue;
  current: Track | undefined;
  playing: boolean;
  loading: boolean;
  error: string | null;
  volume: number;
  muted: boolean;
  gainSetting: GainSetting;
  /** Correction applied to the current track (the "auto" setting resolved). */
  gainMode: GainMode;
  /** Plays these tracks from one of them (shuffled: from a random one). */
  play: (tracks: readonly Track[], index?: number, options?: { shuffled?: boolean }) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (to: number) => void;
  jump: (index: number) => void;
  playNext: (tracks: readonly Track[]) => void;
  append: (tracks: readonly Track[]) => void;
  remove: (index: number) => void;
  clear: () => void;
  setRepeat: (repeat: Repeat) => void;
  toggleShuffle: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setGainSetting: (setting: GainSetting) => void;
}

const MusicContext = createContext<Music | null>(null);
/** Position and duration, separately: they change four times a second. */
const TimeContext = createContext({ time: 0, duration: 0 });

export function useMusic(): Music {
  const music = useContext(MusicContext);
  if (!music) throw new Error("useMusic must be used inside MusicProvider");
  return music;
}

export function useMusicTime(): { time: number; duration: number } {
  return useContext(TimeContext);
}

// --- Settings and queue kept on the device
// --------------------------------------------------------

const volumeKey = "laterna.volume.music";
const gainKey = "laterna.replaygain";

function read<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return (raw === null ? undefined : parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Setting kept for this visit only.
  }
}

interface Saved {
  tracks: JsonValue[];
  index: number;
  repeat: Repeat;
  position: number;
}

/** Queue kept per profile: it comes back, paused, after a reload. */
function restore(key: string): { queue: Queue; position: number } | null {
  return read<{ queue: Queue; position: number } | null>(
    key,
    (raw) => {
      const s = JSON.parse(raw) as Saved;
      const tracks = s.tracks.map((t) => fromJson(TrackSchema, t, { ignoreUnknownFields: true }));
      if (tracks.length === 0) return undefined;
      const queue = startQueue(tracks, s.index, { repeat: s.repeat });
      return { queue, position: s.position };
    },
    null,
  );
}

/** Maximum tracks kept: enough to resume a whole artist without filling the storage. */
const savedLimit = 500;

// --- Player
// ---------------------------------------------------------------------------------------

/**
 * The app's music player: an <audio> element that survives page changes, its queue, and ReplayGain
 * applied with the Web Audio API (the server accepts requests from other origins). Each track opens
 * its own playback on the server (StartPlayback, direct or converted).
 */
export function MusicProvider({ profileId, children }: { profileId: string; children: ReactNode }) {
  const transport = useTransport();
  const playback = useMemo(() => createClient(PlaybackService, transport), [transport]);
  const device = useMemo(detectDeviceProfile, []);
  const storageKey = `laterna.music.${profileId}`;
  const [saved] = useState(() => restore(storageKey));

  const audio = useRef<HTMLAudioElement>(null);
  const graph = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);
  const session = useRef<StartPlaybackResponse | null>(null);
  const generation = useRef(0);
  const position = useRef(saved?.position ?? 0);
  // Position of a restored queue, applied on the first play.
  const resumeAt = useRef(saved?.position ?? 0);

  const [queue, setQueueState] = useState<Queue>(saved?.queue ?? emptyQueue);
  const queueRef = useRef(queue);
  const setQueue = useCallback((q: Queue) => {
    queueRef.current = q;
    setQueueState(q);
  }, []);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(saved?.position ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() =>
    read(volumeKey, (raw) => (Number(raw) >= 0 && Number(raw) <= 1 ? Number(raw) : undefined), 1),
  );
  const [muted, setMuted] = useState(false);
  const [gainSetting, setGainSettingState] = useState<GainSetting>(() =>
    read(
      gainKey,
      (raw) => (["auto", "track", "album", "off"].includes(raw) ? (raw as GainSetting) : undefined),
      "auto",
    ),
  );
  const [graphReady, setGraphReady] = useState(false);

  const current = currentTrack(queue);
  const gainMode = gainModeFor(gainSetting, queue);

  // --- Server playback sessions ---

  const closeSession = useCallback(
    (at: number) => {
      const s = session.current;
      session.current = null;
      if (s) void playback.stopPlayback({ sessionId: s.sessionId, position: durationOf(at) }).catch(() => {});
    },
    [playback],
  );

  /** Web Audio graph (ReplayGain), created on the user's first gesture. */
  const ensureGraph = useCallback(() => {
    const a = audio.current;
    if (!a || typeof AudioContext === "undefined") return;
    if (!graph.current) {
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        ctx.createMediaElementSource(a).connect(gain).connect(ctx.destination);
        graph.current = { ctx, gain };
        setGraphReady(true);
      } catch {
        return;
      }
    }
    if (graph.current.ctx.state === "suspended") void graph.current.ctx.resume().catch(() => {});
  }, []);

  const load = useCallback(
    async (track: Track | undefined, autoplay: boolean, start = 0) => {
      const a = audio.current;
      if (!a || !track) return;
      const gen = ++generation.current;
      closeSession(position.current);
      position.current = start;
      setTime(start);
      setDuration(0);
      setError(null);
      setLoading(true);
      try {
        const s = await playback.startPlayback({ itemId: track.id, fileId: "", device });
        if (gen !== generation.current) {
          void playback.stopPlayback({ sessionId: s.sessionId }).catch(() => {});
          return;
        }
        session.current = s;
        a.src = mediaUrl(s.url);
        if (start > 0)
          a.addEventListener(
            "loadedmetadata",
            () => {
              a.currentTime = start;
            },
            { once: true },
          );
        if (autoplay) await a.play().catch(() => setLoading(false));
      } catch (err) {
        if (gen !== generation.current) return;
        setError(errorMessage(err));
        setLoading(false);
      }
    },
    [closeSession, device, playback],
  );

  const stopAll = useCallback(() => {
    generation.current++;
    closeSession(position.current);
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setPlaying(false);
    setLoading(false);
  }, [closeSession]);

  // --- Controls ---

  const play = useCallback(
    (tracks: readonly Track[], index = 0, options: { shuffled?: boolean } = {}) => {
      const q = startQueue(tracks, index, { shuffled: options.shuffled, repeat: queueRef.current.repeat });
      setQueue(q);
      resumeAt.current = 0;
      ensureGraph();
      void load(currentTrack(q), true);
    },
    [ensureGraph, load, setQueue],
  );

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    ensureGraph();
    if (!session.current) {
      void load(currentTrack(queueRef.current), true, resumeAt.current);
      resumeAt.current = 0;
    } else if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, [ensureGraph, load]);

  const pause = useCallback(() => audio.current?.pause(), []);

  const next = useCallback(() => {
    const { queue: q, ended } = advance(queueRef.current, false);
    if (ended) return;
    setQueue(q);
    ensureGraph();
    void load(currentTrack(q), true);
  }, [ensureGraph, load, setQueue]);

  const previous = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    const q = back(queueRef.current);
    // After three seconds, "previous" goes back to the start of the track.
    if (a.currentTime > 3 || q === queueRef.current) {
      a.currentTime = 0;
      return;
    }
    setQueue(q);
    void load(currentTrack(q), !a.paused || !session.current);
  }, [load, setQueue]);

  const seek = useCallback((to: number) => {
    const a = audio.current;
    if (session.current && a) a.currentTime = Math.max(0, to);
    else {
      resumeAt.current = Math.max(0, to);
      setTime(resumeAt.current);
    }
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      const q = jump(queueRef.current, index);
      if (q === queueRef.current) return;
      setQueue(q);
      ensureGraph();
      void load(currentTrack(q), true);
    },
    [ensureGraph, load, setQueue],
  );

  const addNext = useCallback(
    (tracks: readonly Track[]) => {
      if (queueRef.current.index < 0) play(tracks);
      else setQueue(playNext(queueRef.current, tracks));
    },
    [play, setQueue],
  );

  const addEnd = useCallback(
    (tracks: readonly Track[]) => {
      if (queueRef.current.index < 0) play(tracks);
      else setQueue(append(queueRef.current, tracks));
    },
    [play, setQueue],
  );

  const remove = useCallback(
    (index: number) => {
      const before = queueRef.current;
      const q = removeAt(before, index);
      setQueue(q);
      if (q.index < 0) stopAll();
      else if (index === before.index) void load(currentTrack(q), !audio.current?.paused);
    },
    [load, setQueue, stopAll],
  );

  const clear = useCallback(() => {
    stopAll();
    setQueue({ ...emptyQueue, repeat: queueRef.current.repeat });
  }, [setQueue, stopAll]);

  const setRepeat = useCallback((repeat: Repeat) => setQueue({ ...queueRef.current, repeat }), [setQueue]);
  const shuffleQueue = useCallback(() => setQueue(toggleShuffle(queueRef.current)), [setQueue]);

  const setVolume = useCallback((v: number) => {
    const value = Math.min(1, Math.max(0, v));
    setVolumeState(value);
    setMuted(false);
    write(volumeKey, String(value));
  }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const setGainSetting = useCallback((s: GainSetting) => {
    setGainSettingState(s);
    write(gainKey, s);
  }, []);

  // --- Effects ---

  // The user's volume and the ReplayGain of the current track. Without Web Audio, the correction
  // can only lower the volume.
  // biome-ignore lint/correctness/useExhaustiveDependencies: graphReady signals the graph, held in a ref.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const factor = gainFactor(current?.replayGain, gainMode);
    if (graph.current) {
      graph.current.gain.gain.value = factor;
      a.volume = volume;
    } else a.volume = volume * Math.min(1, factor);
    a.muted = muted;
  }, [current, gainMode, volume, muted, graphReady]);

  // End of a track: the next one, or stop at the end of the queue.
  const onEnded = useCallback(() => {
    const a = audio.current;
    closeSession(a?.duration && Number.isFinite(a.duration) ? a.duration : position.current);
    const { queue: q, ended } = advance(queueRef.current, true);
    if (ended) {
      setPlaying(false);
      resumeAt.current = 0;
      return;
    }
    setQueue(q);
    void load(currentTrack(q), true);
  }, [closeSession, load, setQueue]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const on = (name: string, fn: () => void) => {
      a.addEventListener(name, fn);
      return () => a.removeEventListener(name, fn);
    };
    const report = () => {
      const s = session.current;
      if (s && a.currentTime > 0)
        void playback
          .reportProgress({ sessionId: s.sessionId, position: durationOf(a.currentTime) })
          .catch(() => {});
    };
    const offs = [
      on("play", () => setPlaying(true)),
      on("pause", () => {
        setPlaying(false);
        report();
      }),
      on("timeupdate", () => {
        if (!session.current) return;
        position.current = a.currentTime;
        setTime(a.currentTime);
      }),
      on("durationchange", () => setDuration(Number.isFinite(a.duration) ? a.duration : 0)),
      on("waiting", () => setLoading(true)),
      on("playing", () => setLoading(false)),
      on("canplay", () => setLoading(false)),
      on("ended", onEnded),
      on("error", () => {
        if (!a.getAttribute("src")) return;
        setError(i18n.t("music.cantPlay"));
        setLoading(false);
      }),
    ];
    const timer = setInterval(() => {
      if (!a.paused) report();
    }, 10_000);
    return () => {
      clearInterval(timer);
      for (const off of offs) off();
    };
  }, [onEnded, playback]);

  // Queue kept on the device (without the position, written separately).
  useEffect(() => {
    const save = () =>
      write(
        storageKey,
        JSON.stringify({
          tracks: queue.tracks.slice(0, savedLimit).map((t) => toJson(TrackSchema, t)),
          index: Math.min(queue.index, savedLimit - 1),
          repeat: queue.repeat,
          position: position.current,
        } satisfies Saved),
      );
    if (queue.index < 0) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Nothing to forget.
      }
      return;
    }
    save();
    const timer = setInterval(save, 15_000);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [queue, storageKey]);

  // Tab closing: the current playback is closed (keepalive request).
  useEffect(() => {
    const onHide = () => {
      const s = session.current;
      if (s) stopOnUnload(s.sessionId, position.current);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Unmount (profile change, logout): everything stops.
  useEffect(
    () => () => {
      generation.current++;
      closeSession(position.current);
      void graph.current?.ctx.close().catch(() => {});
    },
    [closeSession],
  );

  // A video or a watch party opens: the music pauses.
  const watching = useLocation({
    select: (l) => ["/play/movie/", "/play/episode/", "/play/party/"].some((p) => l.pathname.startsWith(p)),
  });
  useEffect(() => {
    if (watching) audio.current?.pause();
  }, [watching]);

  // System controls (media keys, lock screen): Media Session.
  const controls = useRef({ toggle, next, previous, seek, pause });
  controls.current = { toggle, next, previous, seek, pause };
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Action unknown to this browser.
      }
    };
    set("play", () => controls.current.toggle());
    set("pause", () => controls.current.pause());
    set("nexttrack", () => controls.current.next());
    set("previoustrack", () => controls.current.previous());
    set("seekto", (d) => d.seekTime !== undefined && controls.current.seek(d.seekTime));
    return () => {
      for (const a of ["play", "pause", "nexttrack", "previoustrack", "seekto"] as const) set(a, null);
    };
  }, []);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const cover = current && pickImage(current.images, ImageKind.POSTER);
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
          title: current.title,
          artist: current.artists || current.artistName,
          album: current.albumTitle,
          artwork: cover ? [{ src: imageUrl(cover, 480), sizes: "480x480" }] : [],
        })
      : null;
  }, [current]);
  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  const music = useMemo<Music>(
    () => ({
      queue,
      current,
      playing,
      loading,
      error,
      volume,
      muted,
      gainSetting,
      gainMode,
      play,
      toggle,
      pause,
      next,
      previous,
      seek,
      jump: jumpTo,
      playNext: addNext,
      append: addEnd,
      remove,
      clear,
      setRepeat,
      toggleShuffle: shuffleQueue,
      setVolume,
      toggleMute,
      setGainSetting,
    }),
    [
      queue,
      current,
      playing,
      loading,
      error,
      volume,
      muted,
      gainSetting,
      gainMode,
      play,
      toggle,
      pause,
      next,
      previous,
      seek,
      jumpTo,
      addNext,
      addEnd,
      remove,
      clear,
      setRepeat,
      shuffleQueue,
      setVolume,
      toggleMute,
      setGainSetting,
    ],
  );
  const clock = useMemo(() => ({ time, duration }), [time, duration]);

  return (
    <MusicContext.Provider value={music}>
      <TimeContext.Provider value={clock}>
        {children}
        {/* biome-ignore lint/a11y/useMediaCaption: music, nothing to caption. */}
        <audio ref={audio} crossOrigin="anonymous" preload="auto" hidden />
      </TimeContext.Provider>
    </MusicContext.Provider>
  );
}

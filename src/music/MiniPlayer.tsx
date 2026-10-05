import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatClock, ImageKind, pickImage, seconds } from "../api/media";
import { Artwork } from "../ui/Artwork";
import { Icon } from "../ui/Icon";
import { usePanelFocus } from "../ui/usePanelFocus";
import { useMusic, useMusicTime } from "./MusicProvider";
import styles from "./music.module.css";
import { describeGain, type GainSetting, type Repeat } from "./queue";

const repeatLabels = {
  off: "music.repeat.off",
  all: "music.repeat.all",
  one: "music.repeat.one",
} as const satisfies Record<Repeat, string>;

const gainLabels = {
  auto: "music.gain.auto",
  album: "music.gain.album",
  track: "music.gain.track",
  off: "music.gain.off",
} as const satisfies Record<GainSetting, string>;

/** Floating player at the bottom of the screen, and its queue. */
export function MiniPlayer() {
  const { t } = useTranslation();
  const music = useMusic();
  const { time, duration } = useMusicTime();
  const [open, setOpen] = useState(false);
  const track = music.current;
  if (!track) return null;
  const total = duration || seconds(track.runtime);

  // Close: the music stops and the queue is cleared; focus, which would leave with the player, goes
  // to the page content.
  const close = () => {
    setOpen(false);
    music.clear();
    const main = document.getElementById("content");
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  };

  return (
    <>
      {open && <QueuePanel onClose={() => setOpen(false)} />}
      <section className={styles.mini} aria-label={t("music.player")} data-ui="mini-player">
        <Link
          to="/music/albums/$id"
          params={{ id: track.albumId }}
          className={styles.miniArt}
          aria-label={t("music.albumOf", { title: track.albumTitle })}
        >
          <Artwork
            image={pickImage(track.images, ImageKind.POSTER)}
            sizes="48px"
            ratio={1}
            universe="music"
            fallback={track.albumTitle}
            shape="round"
          />
        </Link>
        <span className={styles.miniText}>
          <span className={styles.miniTitle}>{track.title}</span>
          <span className={styles.miniMeta}>
            {[track.artists || track.artistName, track.albumTitle].filter(Boolean).join(" · ")} ·{" "}
            {formatClock(time)} / {formatClock(total)}
          </span>
          <Seek time={time} total={total} onSeek={music.seek} />
          {music.error && (
            <span className={styles.miniError} role="alert">
              {music.error}
            </span>
          )}
        </span>
        <button
          type="button"
          className={styles.miniButton}
          onClick={music.previous}
          aria-label={t("music.previous")}
        >
          <Icon name="skipBack" size={16} />
        </button>
        <button
          type="button"
          className={styles.miniPlay}
          onClick={music.toggle}
          aria-label={music.playing ? t("player.pause") : t("player.play")}
          data-loading={music.loading && music.playing}
        >
          <Icon name={music.playing ? "pause" : "play"} size={16} />
        </button>
        <button type="button" className={styles.miniButton} onClick={music.next} aria-label={t("music.next")}>
          <Icon name="skipForward" size={16} />
        </button>
        <button
          type="button"
          className={styles.miniButton}
          aria-label={t("music.queue")}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="queue" size={16} />
        </button>
        <button
          type="button"
          className={styles.miniButton}
          aria-label={t("music.closePlayer")}
          onClick={close}
        >
          <Icon name="close" size={16} />
        </button>
      </section>
    </>
  );
}

/** Seek bar: a native range, for the keyboard and screen readers. */
function Seek({ time, total, onSeek }: { time: number; total: number; onSeek: (t: number) => void }) {
  const { t } = useTranslation();
  const pct = total > 0 ? Math.min(100, (time / total) * 100) : 0;
  return (
    <span className={styles.seek} data-ui="seek">
      <span className={styles.seekFill} style={{ width: `${pct}%` }} />
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.floor(total))}
        step={1}
        value={Math.floor(time)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label={t("music.seek")}
        aria-valuetext={t("player.positionText", { time: formatClock(time), total: formatClock(total) })}
      />
    </span>
  );
}

function QueuePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const music = useMusic();
  const q = music.queue;
  const ref = usePanelFocus<HTMLElement>(true, onClose);
  const currentRow = useRef<HTMLLIElement>(null);
  const left = q.tracks.slice(q.index).reduce((n, x) => n + seconds(x.runtime), 0);

  // The current track, in view when it opens (Escape closes: usePanelFocus).
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <aside ref={ref} className={styles.panel} aria-label={t("music.queue")} data-ui="queue">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{t("music.queue")}</h2>
        <span className={styles.panelMeta}>
          {t("music.queueMeta", { count: q.tracks.length, left: formatClock(left) })}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("music.closeQueue")}>
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className={styles.tools}>
        <button
          type="button"
          className={styles.tool}
          aria-pressed={q.original !== null}
          onClick={music.toggleShuffle}
        >
          <Icon name="shuffle" size={16} />
          {t("music.shuffle")}
        </button>
        <button
          type="button"
          className={styles.tool}
          aria-pressed={q.repeat !== "off"}
          onClick={() => music.setRepeat(q.repeat === "off" ? "all" : q.repeat === "all" ? "one" : "off")}
        >
          <Icon name="repeat" size={16} />
          {t(repeatLabels[q.repeat])}
        </button>
        <button type="button" className={styles.tool} onClick={music.clear}>
          {t("music.clear")}
        </button>
      </div>

      <div className={styles.tools}>
        <button
          type="button"
          className={styles.round}
          onClick={music.toggleMute}
          aria-label={music.muted ? t("player.unmute") : t("player.mute")}
        >
          <Icon name={music.muted || music.volume === 0 ? "mute" : "volume"} size={16} />
        </button>
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={music.muted ? 0 : music.volume}
          onChange={(e) => music.setVolume(Number(e.target.value))}
          aria-label={t("player.volume")}
        />
        <label className={styles.gain}>
          <span>{t("music.normalized")}</span>
          <select
            value={music.gainSetting}
            onChange={(e) => music.setGainSetting(e.target.value as GainSetting)}
          >
            {(Object.keys(gainLabels) as GainSetting[]).map((k) => (
              <option key={k} value={k}>
                {t(gainLabels[k])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {music.current && (
        <p className={styles.gainNote}>{describeGain(music.current.replayGain, music.gainMode)}</p>
      )}

      <ol className={styles.queueList}>
        {q.tracks.map((x, i) => (
          <li
            // The same track can come back in the queue: its place is enough to tell it apart.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            key={`${x.id}-${i}`}
            ref={i === q.index ? currentRow : undefined}
            className={styles.queueItem}
            aria-current={i === q.index ? "true" : undefined}
            data-past={i < q.index}
          >
            <button type="button" className={styles.queueMain} onClick={() => music.jump(i)}>
              <Artwork
                image={pickImage(x.images, ImageKind.POSTER)}
                sizes="40px"
                ratio={1}
                universe="music"
                fallback={x.albumTitle}
                shape="disc"
                className={styles.queueArt}
              />
              <span className={styles.queueText}>
                <span className={styles.queueTitle}>
                  {i === q.index && <Bars playing={music.playing} />}
                  {x.title}
                </span>
                <span className={styles.queueSub}>{x.artists || x.artistName}</span>
              </span>
              <span className={styles.queueTime}>{formatClock(seconds(x.runtime))}</span>
            </button>
            <button
              type="button"
              className={styles.round}
              onClick={() => music.remove(i)}
              aria-label={t("music.removeFromQueue", { title: x.title })}
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Small equalizer bars: the current track (still while paused). */
export function Bars({ playing }: { playing: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={styles.bars} data-playing={playing} role="img" aria-label={t("music.nowPlaying")}>
      <span />
      <span />
      <span />
    </span>
  );
}

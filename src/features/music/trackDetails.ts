import { formatClock, seconds } from "../../api/media";
import { type MediaFile, type ReplayGain, StreamKind } from "../../gen/laterna/v1/catalog_pb";
import i18n, { num } from "../../i18n";
import { decibels } from "../../music/queue";
import { channelsLabel, codecName, fileSize } from "../catalog/format";

const kilo = (n: number, digits = 0) => num(n, { maximumFractionDigits: digits });

/**
 * What is known about a track's file (GetTrack), line by line: format, sample rate, channels,
 * bitrate, size, duration. Lines without a value are left out.
 */
export function trackFileRows(f: MediaFile): { label: string; value: string }[] {
  const t = i18n.t;
  const audio = f.streams.find((s) => s.kind === StreamKind.AUDIO);
  const bitrate = Number(audio?.bitrate || f.bitrate);
  const rows = [
    // Codec and container, once if they are the same ("MP3", not "MP3 · MP3").
    {
      label: t("music.rows.format"),
      value: [...new Set([audio ? codecName(audio.codec) : "", f.container.toUpperCase()])]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: t("music.rows.sampling"),
      value: [
        audio?.sampleRate ? `${kilo(audio.sampleRate / 1000, 1)} kHz` : "",
        audio?.bitDepth ? t("music.bits", { n: audio.bitDepth }) : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { label: t("music.rows.channels"), value: audio ? channelsLabel(audio.channels) : "" },
    { label: t("music.rows.bitrate"), value: bitrate > 0 ? `${kilo(bitrate / 1000)} kbit/s` : "" },
    { label: t("music.rows.size"), value: f.size > 0n ? fileSize(f.size) : "" },
    { label: t("music.rows.duration"), value: f.duration ? formatClock(seconds(f.duration)) : "" },
  ];
  return rows.filter((r) => r.value);
}

/** "track -6.2 dB (peak 0.98) · album -7.1 dB"; empty without ReplayGain. */
export function replayGainLine(rg: ReplayGain | undefined): string {
  const part = (name: string, gain: number | undefined, peak: number | undefined) =>
    gain === undefined
      ? ""
      : `${name} ${decibels(gain)}${peak !== undefined ? ` (${i18n.t("music.peak", { value: kilo(peak, 2) })})` : ""}`;
  return [
    part(i18n.t("music.gainTrack"), rg?.trackGain, rg?.trackPeak),
    part(i18n.t("music.gainAlbum"), rg?.albumGain, rg?.albumPeak),
  ]
    .filter(Boolean)
    .join(" · ");
}

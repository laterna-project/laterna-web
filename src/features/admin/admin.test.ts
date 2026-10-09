import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { AccountSummarySchema } from "../../gen/laterna/v1/account_pb";
import { ActivePlaybackSchema, ActivityKind } from "../../gen/laterna/v1/activity_pb";
import { AccountSchema, LibraryAccessSchema } from "../../gen/laterna/v1/auth_pb";
import { JellyfinTargetKind } from "../../gen/laterna/v1/import_pb";
import { IntegrationKind, IntegrationSchema } from "../../gen/laterna/v1/integration_pb";
import { ItemCountsSchema, LibraryKind } from "../../gen/laterna/v1/library_pb";
import { ParentalControlSchema } from "../../gen/laterna/v1/profile_pb";
import {
  accountTags,
  activityTone,
  durationLabel,
  ffmpegVersion,
  importTarget,
  importTargetValue,
  integrationState,
  jobName,
  libraryCounts,
  matchedShare,
  playbackMethod,
} from "./admin";

describe("administration", () => {
  it("counts a library according to its kind", () => {
    const c = create(ItemCountsSchema, {
      series: 212,
      episodes: 6480,
      movies: 1,
      artists: 3,
      albums: 1,
      tracks: 34,
    });
    expect(libraryCounts(LibraryKind.SHOWS, c)).toBe("212 shows · 6,480 episodes");
    expect(libraryCounts(LibraryKind.MOVIES, c)).toBe("1 movie");
    expect(libraryCounts(LibraryKind.MUSIC, c)).toBe("3 artists · 1 album · 34 tracks");
    expect(libraryCounts(LibraryKind.PHOTOS, c)).toBe("0 albums · 0 photos");
  });

  it("names jobs, versions and durations", () => {
    expect(jobName("file.analyze")).toBe("File analysis");
    expect(jobName("other.thing")).toBe("other.thing");
    expect(ffmpegVersion("ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024")).toBe("7.1");
    expect(ffmpegVersion("ffmpeg version N-118000-g1234 Copyright")).toBe("N-118000-g1234");
    expect(ffmpegVersion("")).toBe("");
    expect(durationLabel(5 * 86_400)).toBe("5 days");
    expect(durationLabel(2 * 3600)).toBe("2 h");
    expect(durationLabel(45 * 60)).toBe("45 min");
  });

  it("colors the activity", () => {
    expect(activityTone(ActivityKind.LOGIN_FAILED, true)).toBe("danger");
    expect(activityTone(ActivityKind.LIBRARY_SCANNED, false)).toBe("collections");
    expect(activityTone(ActivityKind.PARTY_STARTED, false)).toBe("party");
    expect(activityTone(ActivityKind.LOGIN, false)).toBe("playlists");
  });

  it("sums up an account in tags", () => {
    const names = new Map([
      ["f", "Movies"],
      ["s", "Series"],
    ]);
    const summary = (account: object) =>
      create(AccountSummarySchema, { account: create(AccountSchema, account) });
    expect(accountTags(summary({ isAdmin: true, denyDownloads: false }), names)).toEqual([
      {
        label: "administrator",
        tone: "admin",
      },
    ]);
    expect(
      accountTags(
        summary({
          libraries: create(LibraryAccessSchema, { all: false, libraryIds: ["f", "s"] }),
          parental: create(ParentalControlSchema, { maxAge: 16 }),
          denyDownloads: true,
          disabled: true,
        }),
        names,
      ),
    ).toEqual([
      {
        label: "Movies, Series",
        tone: undefined,
      },
      {
        label: "16 years",
      },
      {
        label: "no downloads",
        tone: "warn",
      },
      {
        label: "disabled",
        tone: "warn",
      },
    ]);
    expect(accountTags(summary({ libraries: create(LibraryAccessSchema, { all: true }) }), names)).toEqual([
      {
        label: "all libraries",
      },
    ]);
  });

  it("describes how it plays", () => {
    const p = (fields: object) => create(ActivePlaybackSchema, fields);
    expect(playbackMethod(p({ method: "direct" }))).toEqual({
      label: "direct play",
      transcoded: false,
    });
    expect(playbackMethod(p({ method: "remux" })).label).toBe("no transcoding");
    expect(playbackMethod(p({ method: "transcode", encoder: "h264_nvenc", gpu: true })).label).toBe(
      "transcoded · h264_nvenc · GPU",
    );
    expect(playbackMethod(p({ method: "transcode", encoder: "h264_nvenc", decoder: "cuda" })).label).toBe(
      "transcoded · h264_nvenc · cuda decoding",
    );
    expect(playbackMethod(p({ method: "transcode", copyVideo: true })).label).toBe("transcoded · audio");
  });

  it("describes the state of Sonarr and Radarr", () => {
    const i = (fields: object) => create(IntegrationSchema, { kind: IntegrationKind.RADARR, ...fields });
    expect(integrationState(i({}))).toEqual({
      checks: [],
      pill: "not linked",
    });
    expect(integrationState(i({ url: "http://nas:7878", error: "connection refused" }))).toMatchObject({
      pill: "unreachable",
      tone: "warn",
      checks: [{ ok: false, label: "connection refused" }],
    });
    const state = integrationState(
      i({
        url: "http://nas:7878",
        reachable: true,
        webhook: true,
        missingOptions: ["Collection images", "Fanart"],
        folders: 40,
        unmapped: 2,
        withoutNfo: 4,
        withoutNfoTitles: ["Alien", "Brazil", "Casablanca"],
      }),
    );
    expect(state.pill).toBe("connected");
    expect(state.checks.map((c) => c.label)).toEqual([
      "Webhook installed",
      "Kodi metadata: 2 missing options (Collection images, Fanart)",
      "2 movies out of 40 outside Laterna's libraries",
      "4 without an NFO: Alien, Brazil, Casablanca...",
    ]);
  });
});

describe("import from Jellyfin", () => {
  it("goes from a target to a select value and back", () => {
    for (const value of ["skip", "new-account", "new-profile:a1", "profile:p1"])
      expect(importTargetValue(importTarget(value))).toBe(value);
    expect(importTarget("profile:p1")).toMatchObject({ kind: JellyfinTargetKind.PROFILE, profileId: "p1" });
    expect(importTargetValue(undefined)).toBe("skip");
  });

  it("gives the share found", () => {
    expect(matchedShare(48, 50)).toBe("96 %");
    expect(matchedShare(0, 0)).toBe("—");
  });
});

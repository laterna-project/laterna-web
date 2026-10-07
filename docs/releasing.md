# Branches, versions and releases

This page is for maintainers. Contributors only need the short version in
[CONTRIBUTING.md](../CONTRIBUTING.md#branches).

## Branches

Laterna Web follows git-flow, like the server.

| Branch | Holds | Receives |
|---|---|---|
| `main` | released code; every commit on it is a release, tagged `vX.Y.Z` | `release/*` and `hotfix/*`, as merge commits |
| `develop` | the next release; the default branch | pull requests, squashed; `main` after each release |
| `feature/*`, `fix/*`, `docs/*`, `ci/*` | one change | branched from `develop`, merged back by pull request |
| `release/X.Y.Z` | a release being stabilized | fixes only |
| `hotfix/X.Y.Z` | an urgent fix to the latest release | branched from `main` |

On `develop`, a pull request is one squashed commit whose subject starts with a gitmoji. The only
merge commits there are the ones that bring a release back from `main`. `main` only moves when a
version is released.

## Versions

Versions follow [Semantic Versioning](https://semver.org/). What counts as the public interface:

- the server versions a release works with;
- the theme file format and the `data-ui` hooks ([docs/themes.md](themes.md));
- the addresses of the app's pages, which people bookmark and which the server links to (the
  device login page, `/device`);
- the archive's layout and what it needs from the reverse proxy.

While the version is `0.x`, a minor version may change any of these, and the release notes say how
to upgrade. Patch versions only fix. From `1.0` on, a breaking change needs a major version.

The version is written in `package.json`; the client sends it to the server when it signs in. The
release workflow refuses a tag that does not match it.

### Following the server

The client is generated from one server release, pinned in `package.json` (`laternaServer`).
Moving to a new server version is a pull request of its own: change the pin, run `pnpm gen`, adapt
the client, and update the table of server versions in the README.

## Cutting a release

```sh
# 1. Branch from develop and set the version. From here on, develop is open for the next one.
git switch develop && git pull
git switch -c release/0.2.0
pnpm version 0.2.0 --no-git-tag-version
git commit -am "🔖 Prepare 0.2.0"
git push -u origin release/0.2.0

# 2. Stabilize: only fixes, each by pull request into release/0.2.0.
#    Optional release candidate, published as a pre-release:
git tag -a v0.2.0-rc.1 -m "v0.2.0-rc.1" && git push origin v0.2.0-rc.1

# 3. Release: merge into main with a merge commit, then tag main.
gh pr create --base main --head release/0.2.0 --title "🔖 Release 0.2.0" --body ""
gh pr merge --merge
git switch main && git pull
git tag -a v0.2.0 -m "v0.2.0" && git push origin v0.2.0

# 4. Bring the release back to develop.
gh pr create --base develop --head main --title "🔀 Merge release 0.2.0 into develop" --body ""
gh pr merge --merge
```

The back-merge in step 4 is the one pull request into `develop` that is not squashed: the merge
commit is what tells git that `develop` contains the release.

Pushing the tag starts the [release workflow](../.github/workflows/release.yml), which:

1. checks that the tag matches `package.json` and points at a commit of `main` (pre-release tags
   are exempt from the second check);
2. runs `pnpm check`;
3. packs the build with `LICENSE`, `README.md` and `THIRD_PARTY_LICENSES.md` (the licenses of the
   production dependencies, from `scripts/licenses.mjs`) into `laterna-web-X.Y.Z.tar.gz` and
   `.zip`, with their SHA-256 in `checksums.txt`;
4. unpacks the archive, serves it as the README describes and checks that the page, a route and
   every file it references load (`scripts/smoke-test.mjs`);
5. uploads everything to a **draft** release, with notes built by `scripts/release-notes.ts`:
   the commit subjects since the previous release grouped by gitmoji (features, fixes, security,
   performance, other changes; CI, tests, tools and release commits left out), then how to
   install, as on the server;
6. attests the provenance of the archives;
7. publishes the release.

If a step fails, the draft stays unpublished: fix the problem, delete the draft and the tag, and
tag again.

Then describe the release by hand, as the server's are (`gh release edit vX.Y.Z --notes-file`):
a sentence on what the version brings at the top, each feature in a sentence or two instead of its
commit subject, and an "Upgrading from X.Y" section on what changes for the people who serve the
client (server versions, files of the archive, proxy, themes).

To see what a release would contain without publishing anything, run the workflow by hand
(`gh workflow run release.yml`): it builds a snapshot archive, runs the same checks and keeps the
files as a workflow artifact.

## Hotfix

```sh
git switch main && git pull
git switch -c hotfix/0.2.1
pnpm version 0.2.1 --no-git-tag-version
# fix, push, then the same steps 3 and 4 as a release, with v0.2.1
```

## Repository settings

Branch and tag rules are kept in [`.github/rulesets/`](../.github/rulesets) and applied with:

```sh
for f in .github/rulesets/*.json; do
  gh api --method POST repos/laterna-project/laterna-web/rulesets --input "$f"
done
```

- `develop` and `main`: no direct push, no force push, pull request with green checks (`Check`,
  `Dependencies`) required. `main` only accepts merge commits. `develop` accepts squash merges,
  and merge commits for the back-merge of a release.
- `v*` tags: created by administrators only, never moved or deleted.
- Squash and merge commits are allowed, rebase merges are not, and merged branches are deleted.
- Workflows get a read-only token by default; each job asks for what it needs.

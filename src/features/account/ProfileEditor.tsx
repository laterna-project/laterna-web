import { create } from "@bufbuild/protobuf";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../api/errors";
import { useInvalidate } from "../../api/invalidate";
import { AuthService } from "../../gen/laterna/v1/auth_pb";
import { ParentalControlSchema, type Profile, ProfileService } from "../../gen/laterna/v1/profile_pb";
import { Alert } from "../../ui/Alert";
import { Avatar, profileUniverse } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Field } from "../../ui/Field";
import { Status } from "../../ui/Status";
import { Switch } from "../../ui/Switch";
import styles from "./account.module.css";
import { ageChoice, ages } from "./parental";

/** The server's default for a kid profile: 10 years old, unrated content hidden. */
const kidDefault = { maxAge: 10 as number | null, blockUnrated: true };

interface Draft {
  name: string;
  pin: string;
  removePin: boolean;
  currentPin: string;
  kid: boolean;
  maxAge: number | null;
  blockUnrated: boolean;
}

const draftOf = (p: Profile | undefined): Draft => ({
  name: p?.name ?? "",
  pin: "",
  removePin: false,
  currentPin: "",
  kid: p?.kid ?? false,
  maxAge: p?.parental?.maxAge ?? null,
  blockUnrated: p?.parental?.blockUnrated ?? false,
});

/** Profiles of the account: choose, create, edit, delete. */
export function ProfileEditor({ currentId }: { currentId: string }) {
  const { t } = useTranslation();
  const list = useQuery(ProfileService.method.listProfiles, {});
  const profiles = list.data?.profiles ?? [];
  const ids = profiles.map((p) => p.id);
  const [selected, setSelected] = useState<string | "new">(currentId);
  const editing = selected === "new" ? undefined : profiles.find((p) => p.id === selected);

  return (
    <section className={styles.card} aria-labelledby="profiles">
      <h2 id="profiles" className={styles.cardTitle}>
        {t("account.profilesTitle")}
      </h2>
      <fieldset className={styles.chips}>
        <legend className="sr-only">{t("account.profileToEdit")}</legend>
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.chip}
            aria-pressed={p.id === selected}
            onClick={() => setSelected(p.id)}
          >
            <Avatar name={p.name} universe={profileUniverse(ids, p.id)} size="sm" />
            <span>{p.id === currentId ? t("account.you", { name: p.name }) : p.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.chip}
          aria-pressed={selected === "new"}
          onClick={() => setSelected("new")}
        >
          <span className={styles.plus} aria-hidden="true">
            +
          </span>
          <span>{t("account.addProfile")}</span>
        </button>
      </fieldset>

      {list.isSuccess && (selected === "new" || editing) && (
        <ProfileForm key={selected} profile={editing} currentId={currentId} onChoose={setSelected} />
      )}
    </section>
  );
}

/** Form of a profile (or a new one); remounted for each chosen profile. */
function ProfileForm({
  profile: editing,
  currentId,
  onChoose,
}: {
  profile: Profile | undefined;
  currentId: string;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<Draft>(() => draftOf(editing));
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...patch }));
  };

  // Profiles, and the session (it carries the chosen profile, its name and its parental controls).
  const refresh = () => invalidate(ProfileService, AuthService);
  const createProfile = useMutation(ProfileService.method.createProfile, {
    onSuccess: async (res) => {
      await refresh();
      if (res.profile) onChoose(res.profile.id);
    },
  });
  const updateProfile = useMutation(ProfileService.method.updateProfile, {
    onSuccess: async () => {
      await refresh();
      setSaved(true);
      setDraft((d) => ({ ...d, pin: "", currentPin: "", removePin: false }));
    },
  });
  const deleteProfile = useMutation(ProfileService.method.deleteProfile, {
    onSuccess: async () => {
      setDeleting(false);
      await refresh();
      onChoose(currentId);
    },
  });
  const error = createProfile.error ?? updateProfile.error;
  const pinOk = draft.pin === "" || /^\d{4,8}$/.test(draft.pin);
  const parental = create(ParentalControlSchema, {
    maxAge: draft.maxAge ?? undefined,
    blockUnrated: draft.blockUnrated,
  });

  const save = () => {
    if (!editing) {
      createProfile.mutate({ name: draft.name.trim(), pin: draft.pin, kid: draft.kid, parental });
      return;
    }
    updateProfile.mutate({
      profileId: editing.id,
      currentPin: draft.currentPin,
      name: draft.name.trim() !== editing.name ? draft.name.trim() : undefined,
      pin: draft.removePin ? "" : draft.pin || undefined,
      kid: draft.kid !== editing.kid ? draft.kid : undefined,
      parental,
    });
  };

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.name.trim() && pinOk) save();
        }}
      >
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Status
          className={styles.ok}
          message={saved ? (editing ? t("account.profileSaved") : t("account.profileCreated")) : ""}
        />
        <div className={styles.grid}>
          <Field
            label={t("account.profileName")}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={50}
            required
          />
          <Field
            label={editing?.hasPin ? t("account.newPin") : t("account.pin")}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={editing?.hasPin ? t("account.pinUnchanged") : t("account.pinNone")}
            value={draft.pin}
            disabled={draft.removePin}
            error={pinOk ? undefined : t("account.pinFormat")}
            onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
          />
        </div>
        {editing?.hasPin && (
          <div className={styles.grid}>
            <Field
              label={t("account.currentPin")}
              hint={t("account.currentPinHint")}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={draft.currentPin}
              onChange={(e) => set({ currentPin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.removePin}
                onChange={(e) => set({ removePin: e.target.checked, pin: "" })}
              />
              {t("account.removePin")}
            </label>
          </div>
        )}
        <Switch
          label={t("account.kid")}
          hint={t("account.kidHint")}
          on={draft.kid}
          onChange={(kid) =>
            set(kid && !draft.kid && draft.maxAge === null ? { kid, ...kidDefault } : { kid })
          }
        />
        <fieldset className={styles.ages}>
          <legend className={styles.label}>{t("account.maxAge")}</legend>
          <div className={styles.chips}>
            {ages.map((a) => (
              <button
                key={String(a)}
                type="button"
                className={styles.age}
                aria-pressed={draft.maxAge === a}
                onClick={() => set({ maxAge: a })}
              >
                {ageChoice(a)}
              </button>
            ))}
          </div>
        </fieldset>
        <Switch
          label={t("account.blockUnrated")}
          hint={t("account.blockUnratedHint")}
          on={draft.blockUnrated}
          onChange={(blockUnrated) => set({ blockUnrated })}
        />
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={!draft.name.trim() || !pinOk || createProfile.isPending || updateProfile.isPending}
          >
            {editing ? t("common.save") : t("account.createProfile")}
          </Button>
          <span className={styles.spacer} />
          {editing && editing.id !== currentId && (
            <button type="button" className={styles.danger} onClick={() => setDeleting(true)}>
              {t("account.deleteProfile")}
            </button>
          )}
        </div>
      </form>

      {deleting && editing && (
        <Dialog
          title={t("account.deleteProfileTitle", { name: editing.name })}
          onClose={() => setDeleting(false)}
        >
          <p>{t("account.deleteProfileText")}</p>
          {deleteProfile.isError && <Alert>{errorMessage(deleteProfile.error)}</Alert>}
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              deleteProfile.mutate({ profileId: editing.id, currentPin: draft.currentPin });
            }}
          >
            {editing.hasPin && (
              <Field
                label={t("account.profilePin")}
                type="password"
                inputMode="numeric"
                value={draft.currentPin}
                onChange={(e) => set({ currentPin: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                data-autofocus
              />
            )}
            <div className={styles.actions}>
              <span className={styles.spacer} />
              <Button onClick={() => setDeleting(false)}>{t("common.keep")}</Button>
              <Button type="submit" variant="primary" disabled={deleteProfile.isPending}>
                {t("common.delete")}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

import { create } from "@bufbuild/protobuf";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRuntime, seconds } from "../api/media";
import { ItemSearch } from "../features/catalog/ItemSearch";
import { PartyQueueSchema, PartyStatus } from "../gen/laterna/v1/party_pb";
import { universes } from "../theme/contract";
import { Alert } from "../ui/Alert";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { itemTitle } from "./PartyStage";
import styles from "./party.module.css";
import { type MemberState, memberState } from "./sync";
import type { PartySession } from "./useParty";

/** Reactions offered (emoji, 32 characters at most on the server). */
const quick = ["❤️", "😂", "👏", "😮"];

/** Color of a member's state: loading, syncing, or all good. */
const tone = (s: MemberState) => (s === "loading" || s === "sync" ? s : "ok");

/** Color of a member: the universe colors, in order of arrival. */
const tint = (i: number) => `var(--color-${universes[i % universes.length]})`;
const ink = (i: number) => `var(--color-${universes[i % universes.length]}-ink)`;

/** Panel of the watch party: code, members, queue, chat. */
export function PartyPanel({ session }: { session: PartySession }) {
  const { t } = useTranslation();
  const { party, state, me, canControl, control, messages, send, leave, end, kick, error } = session;
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const chat = useRef<HTMLDivElement>(null);
  const members = state?.members ?? [];
  const status = state?.status ?? PartyStatus.PAUSED;

  // The last message in view, on each new message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: triggered by the arrival of a message.
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [messages.length]);

  if (!party || !state) return <aside className={styles.panel} aria-busy="true" data-ui="party-panel" />;

  return (
    <aside className={styles.panel} aria-label={t("party.panel")} data-ui="party-panel">
      <section className={styles.block}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t("party.title")}</h1>
          {me?.host && <span className={styles.badge}>{t("party.host")}</span>}
        </div>
        <p className={styles.label}>{t("party.code")}</p>
        <div className={styles.code}>
          <span className={styles.codeText}>{party.code}</span>
          <button
            type="button"
            className={styles.copy}
            onClick={() =>
              void navigator.clipboard?.writeText(party.code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
            }
          >
            {copied ? t("party.copied") : t("party.copy")}
          </button>
        </div>
        <div className={styles.switchRow}>
          <span>{t("party.hostOnly")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.hostOnly}
            aria-label={t("party.hostOnly")}
            className={styles.switch}
            disabled={!me?.host}
            onClick={() => void control({ case: "hostOnly", value: !state.hostOnly })}
          >
            <span />
          </button>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="members">
        <p id="members" className={styles.label}>
          {t("party.present", { n: members.length })}
        </p>
        {members.map((m, i) => (
          <div key={m.id} className={styles.member}>
            <span className={styles.avatar} style={{ background: tint(i), color: ink(i) }} aria-hidden="true">
              {m.name.slice(0, 1).toUpperCase()}
            </span>
            <span className={styles.memberName}>
              {m.name}
              {m.id === me?.id ? t("party.you") : ""}
              {m.host && m.id !== me?.id ? t("party.hostSuffix") : ""}
            </span>
            <span className={styles.status} data-state={tone(memberState(m, status))}>
              {t(`party.status.${memberState(m, status)}`)}
            </span>
            {me?.host && m.id !== me.id && (
              <button
                type="button"
                className={styles.kick}
                onClick={() => void kick(m.id)}
                aria-label={t("party.kick", { name: m.name })}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        ))}
      </section>

      <section className={styles.block} aria-labelledby="party-queue">
        <div className={styles.titleRow}>
          <p id="party-queue" className={styles.label}>
            {t("party.queue")}
          </p>
          <span className={styles.spacer} />
          {canControl && (
            <button type="button" className={styles.small} onClick={() => setAdding(true)}>
              {t("party.add")}
            </button>
          )}
        </div>
        <ol className={styles.queue}>
          {state.queue.map((id, i) => {
            const it = party.items.find((x) => x.item.value?.id === id);
            const title = itemTitle(it);
            const current = i === state.index;
            const runtime = it?.item.case ? seconds(it.item.value.runtime) : 0;
            return (
              // The same item can come back in the queue: its place tells it apart.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above.
              <li key={`${id}-${i}`}>
                <button
                  type="button"
                  className={styles.queueItem}
                  aria-current={current ? "true" : undefined}
                  disabled={!canControl || current}
                  onClick={() => void control({ case: "select", value: i })}
                >
                  <span className={styles.queueTitle}>{title.title || "..."}</span>
                  <span className={styles.queueState}>
                    {current ? t("party.current") : runtime ? formatRuntime(runtime) : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.chatBlock} aria-label={t("party.chat")}>
        <div ref={chat} className={styles.chat} data-ui="chat">
          {messages.length === 0 && <p className={styles.hint}>{t("party.chatHint")}</p>}
          {messages.map((m, i) => {
            const mine = m.memberId === me?.id;
            const who = members.findIndex((x) => x.id === m.memberId);
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: messages have no identifier.
                key={i}
                className={styles.message}
                data-mine={mine}
              >
                <span
                  className={styles.avatarSmall}
                  style={{ background: tint(Math.max(0, who)), color: ink(Math.max(0, who)) }}
                  title={m.name}
                  aria-hidden="true"
                >
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.bubble} data-reaction={m.reaction}>
                  {!mine && <span className="sr-only">{m.name} : </span>}
                  {m.text}
                </span>
              </div>
            );
          })}
        </div>
        <form
          className={styles.compose}
          onSubmit={(e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            void send(body);
            setText("");
          }}
        >
          {quick.map((r) => (
            <button
              key={r}
              type="button"
              className={styles.react}
              onClick={() => void send(r, true)}
              aria-label={t("party.react", { emoji: r })}
            >
              {r}
            </button>
          ))}
          <label htmlFor="party-message" className="sr-only">
            {t("party.messageLabel")}
          </label>
          <input
            id="party-message"
            className={styles.input}
            value={text}
            maxLength={500}
            placeholder={t("party.messagePlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className={styles.send} aria-label={t("party.send")} disabled={!text.trim()}>
            <Icon name="arrow" size={16} />
          </button>
        </form>
      </section>

      {error && <Alert>{error}</Alert>}

      <div className={styles.leave}>
        <button
          type="button"
          className={styles.quit}
          onClick={async () => {
            await leave();
            void navigate({ to: "/" });
          }}
        >
          {t("party.leave")}
        </button>
        {me?.host && (
          <button type="button" className={styles.endAll} onClick={() => void end()}>
            {t("party.endAll")}
          </button>
        )}
      </div>

      {adding && (
        <Dialog title={t("party.addTitle")} onClose={() => setAdding(false)}>
          <ItemSearch
            label={t("party.addLabel")}
            placeholder={t("party.addPlaceholder")}
            accept={["movie", "episode", "series", "track", "album"]}
            autoFocus
            onPick={(it) => {
              void control({
                case: "queue",
                value: create(PartyQueueSchema, {
                  itemIds: [...state.queue, it.value.id],
                  index: state.index,
                }),
              });
              setAdding(false);
            }}
          />
        </Dialog>
      )}
    </aside>
  );
}

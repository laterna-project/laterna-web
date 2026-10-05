import i18n from "../i18n";
import { httpErrorMessage } from "./errors";
import { mediaUrl } from "./media";
import { sessionToken } from "./session";

type SavePicker = (options: { suggestedName?: string }) => Promise<FileSystemFileHandle>;

/**
 * Saves a server file protected by the device token (downloads and their subtitles, logs): a link
 * cannot carry the Authorization header. Where the browser allows it, the file is streamed to the
 * place the user picked; elsewhere it is kept in memory, then offered for saving. Returns false if
 * the user gives up.
 */
export async function saveFile(
  path: string,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  let handle: FileSystemFileHandle | undefined;
  if (picker) {
    // Asked before any wait: the picker requires a user gesture.
    try {
      handle = await picker({ suggestedName: fileName });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      throw e;
    }
  }

  const token = sessionToken();
  const res = await fetch(mediaUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok || !res.body)
    throw new Error(
      httpErrorMessage(res.headers.get("Laterna-Error"), res.ok ? "" : await res.text().catch(() => "")) ??
        (res.status === 404
          ? i18n.t("errors.fileGone")
          : i18n.t("errors.fileRefused", { status: res.status })),
    );
  const total = Number(res.headers.get("Content-Length") ?? 0);
  let done = 0;
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        done += chunk.byteLength;
        onProgress?.(done, total);
        controller.enqueue(chunk);
      },
    }),
  );

  if (handle) {
    await counted.pipeTo(await handle.createWritable());
    return true;
  }
  offer(await new Response(counted).blob(), fileName);
  return true;
}

/** Offers to save bytes received from the API (an exported theme). */
export function saveBytes(data: Uint8Array, fileName: string, type: string): void {
  offer(new Blob([new Uint8Array(data)], { type }), fileName);
}

function offer(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

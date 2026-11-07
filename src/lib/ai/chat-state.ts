export interface PollMessage {
  role: "user" | "assistant";
  createdAt?: string | Date;
}

export const POLL_WINDOW_MS = 150_000;

// A conversation whose newest message is the owner's own, sent recently, probably has a reply still being written.
export function shouldPoll(messages: PollMessage[], now: number = Date.now()): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.createdAt) return false;
  const age = now - new Date(last.createdAt).getTime();
  return age >= 0 && age < POLL_WINDOW_MS;
}

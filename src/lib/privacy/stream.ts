import { rehydrateText } from "./rehydrate";
import type { TokenMap } from "./tokens";

// Rehydrates streamed text without ever emitting half a placeholder.
// If the buffer ends in something that could still become a token (e.g. "[PERS"), it is held back until more text arrives.
export class StreamRehydrator {
  private buffer = "";
  readonly unresolved: string[] = [];

  constructor(private map: TokenMap) {}

  push(chunk: string): string {
    this.buffer += chunk;
    const open = this.buffer.lastIndexOf("[");
    let emit = this.buffer;
    let keep = "";
    if (open !== -1 && /^\[[A-Za-z_0-9]{0,40}$/.test(this.buffer.slice(open))) {
      emit = this.buffer.slice(0, open);
      keep = this.buffer.slice(open);
    }
    this.buffer = keep;
    return this.convert(emit);
  }

  flush(): string {
    const rest = this.buffer;
    this.buffer = "";
    return this.convert(rest);
  }

  private convert(text: string): string {
    if (!text) return "";
    const r = rehydrateText(text, this.map);
    this.unresolved.push(...r.unresolved);
    return r.value;
  }
}

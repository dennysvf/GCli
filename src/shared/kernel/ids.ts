import { uuidv7 } from "uuidv7";

// Time-ordered UUIDs for every primary key (architecture section 6).
export function newId(): string {
  return uuidv7();
}

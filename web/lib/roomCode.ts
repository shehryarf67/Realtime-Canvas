// Codes stay readable at the front, while the random suffix makes private room
// ids impractical to guess. The suffix is the important security part.

const ADJECTIVES = [
  "calm", "brave", "bright", "swift", "quiet", "warm", "bold", "soft",
  "lucky", "merry", "clever", "gentle", "lively", "sunny", "cosmic", "amber",
  "coral", "azure", "violet", "teal", "golden", "misty", "fresh", "noble",
] as const;

const NOUNS = [
  "river", "deck", "harbor", "meadow", "canvas", "ember", "pebble", "willow",
  "lantern", "comet", "garden", "summit", "anchor", "maple", "falcon", "otter",
  "cabin", "prairie", "beacon", "thicket", "valley", "marble", "cedar", "robin",
  "delta", "orchard", "ridge", "cove", "fjord", "atlas",
] as const;

// Skip vowels and lookalike characters so codes are easier to read aloud.
const TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstvwxyz"; // 30 chars
const TOKEN_LENGTH = 10; // About 2^49 possible suffixes.

// Reject the uneven tail of 0..255 so every character has the same chance.
function randomInt(maxExclusive: number): number {
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  const buffer = new Uint8Array(1);
  // Usually this returns on the first random byte.
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0]! < limit) return buffer[0]! % maxExclusive;
  }
}

function pick<T>(list: readonly T[]): T {
  return list[randomInt(list.length)]!;
}

function randomToken(length: number): string {
  let token = "";
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return token;
}

export function generateRoomCode(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${randomToken(TOKEN_LENGTH)}`;
}

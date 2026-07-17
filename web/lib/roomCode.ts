// Generates board codes like "calm-river-k7m2p9qx4n": a short human-readable
// prefix for shareability, plus a high-entropy random suffix that is the real
// security boundary. The words make a code easy to recognize and read aloud;
// the suffix makes the full code infeasible to guess or enumerate.
//
// Why the suffix matters: the code is the ONLY capability protecting a board
// (there's no separate share secret). A words-only scheme had ~20,000
// combinations — trivially enumerable, so anyone could walk the whole space
// and reach every board. The random suffix below adds ~50 bits of entropy,
// putting the full code space out of brute-force reach.

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

// Crockford-style base32 with vowels and visually ambiguous characters removed
// (no 0/o, 1/l/i, u), so codes are easy to read aloud and hard to mistype.
const TOKEN_ALPHABET = "23456789abcdefghjkmnpqrstvwxyz"; // 30 chars
const TOKEN_LENGTH = 10; // 30^10 ≈ 2^49 combinations

// Unbiased index in [0, maxExclusive). All our alphabets are < 256, so one
// random byte suffices; we reject bytes in the final partial bucket so every
// value is equally likely — a plain `% maxExclusive` skews toward low values.
function randomInt(maxExclusive: number): number {
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  const buffer = new Uint8Array(1);
  // Loop runs >1 time only for the rejected tail; expected iterations ~1.
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

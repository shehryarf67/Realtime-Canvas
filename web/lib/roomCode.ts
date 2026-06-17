// Generates short, readable, shareable board codes like "calm-river-deck" —
// easier to read aloud or paste than a raw UUID. Single source of truth for
// room-code generation.

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

function randomInt(maxExclusive: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
}

function pick<T>(list: readonly T[]): T {
  return list[randomInt(list.length)];
}

export function generateRoomCode(): string {
  const adjective = pick(ADJECTIVES);
  const first = pick(NOUNS);
  let second = pick(NOUNS);
  while (second === first) {
    second = pick(NOUNS);
  }
  return `${adjective}-${first}-${second}`;
}

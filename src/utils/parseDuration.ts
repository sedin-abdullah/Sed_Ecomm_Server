const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parses a simple duration string like "15m", "7d", "30s", "2h" into
 * milliseconds. Falls back to treating a bare number string as seconds.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(duration.trim());

  if (!match) {
    const asNumber = Number(duration);
    if (!Number.isNaN(asNumber)) {
      return asNumber * 1000;
    }
    throw new Error(`Invalid duration string: "${duration}"`);
  }

  const [, value, unit] = match;
  return Number(value) * UNIT_TO_MS[unit.toLowerCase()];
}

export default parseDurationToMs;

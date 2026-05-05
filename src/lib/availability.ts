export type AvailStatus = "available" | "waitlist" | "regret" | "unknown";

export function classifyAvailability(value: string | undefined): AvailStatus {
  if (!value) return "unknown";
  const v = value.toUpperCase();
  if (v.includes("AVAILABLE") || v.includes("AVBL")) return "available";
  if (/^\d+$/.test(v) && parseInt(v) > 0) return "available";
  if (v.includes("WL") || v.includes("RAC")) return "waitlist";
  if (v.includes("REGRET") || v.includes("NOT AVAILABLE") || v.includes("GNWL")) return "regret";
  return "unknown";
}

export function parseDurationMinutes(duration: string | undefined): number {
  if (!duration) return 0;
  const m1 = duration.match(/(\d+)h\s*(\d+)m?/);
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2]);
  const m2 = duration.match(/(\d+):(\d+)/);
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2]);
  const m3 = duration.match(/(\d+)h/);
  if (m3) return parseInt(m3[1]) * 60;
  return 0;
}

export function timeToMinutes(t: string | undefined): number {
  if (!t) return 0;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export function timeOfDayBucket(t: string | undefined): "early" | "morning" | "afternoon" | "evening" | "night" {
  const m = timeToMinutes(t);
  const h = Math.floor(m / 60);
  if (h < 6) return "early";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}
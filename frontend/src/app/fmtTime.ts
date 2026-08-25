// server sends UTC, we show Sydney. the old code did .replace("T"," ").slice(0,19)
// which just chopped the offset off and displayed UTC while looking local.
const TZ = "Australia/Sydney";

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  // some rows come back without an offset - those are UTC, say so explicitly or
  // the browser reads them as local and the whole log shifts 10 hours
  const s = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) return iso.replace("T", " ").slice(0, 19);
  const p = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function nowLocal(): string {
  return fmtTime(new Date().toISOString());
}

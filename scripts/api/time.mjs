// Kick-off times. Sources give a local date and time in the league's own clock; the app and structured data need an absolute time.

/** "2026-05-24T20:45:00+02:00" for a local kick-off in an IANA time zone, or null when the game has no time yet. */
export function kickoff(date, time, tz) {
  if (!time || !tz) return null;
  const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T${time}:00Z`)).find((p) => p.type === "timeZoneName").value.replace("GMT", "");
  return `${date}T${time}:00${off === "" ? "+00:00" : off}`;
}

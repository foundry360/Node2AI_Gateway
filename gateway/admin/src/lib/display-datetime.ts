const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format as `06 Sep 26 11:48:52` in local time. */
export function formatDisplayDateTime(value: string | undefined | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  const day = pad2(d.getDate());
  const month = MONTHS[d.getMonth()];
  const year = pad2(d.getFullYear() % 100);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${day} ${month} ${year} ${time}`;
}

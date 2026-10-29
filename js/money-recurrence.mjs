const dayMs = 86400000;
export const scheduleFrequencies = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  semiannual: 'Every 6 months',
  yearly: 'Yearly',
  weeks: 'Every N weeks',
};
export const calendarFrequency = (s) =>
  ['monthly', 'quarterly', 'semiannual', 'yearly'].includes(
    typeof s === 'string' ? s : s.frequency,
  );
export const monthStride = (s) =>
  ({ monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 })[s.frequency];
export const dayStride = (s) =>
  s.frequency === 'weekly' ? 7 : s.frequency === 'biweekly' ? 14 : 7 * s.intervalWeeks;
export function validRecurrence(s) {
  return (
    Object.hasOwn(scheduleFrequencies, s.frequency) &&
    (s.frequency !== 'weeks' ||
      (Number.isInteger(s.intervalWeeks) && s.intervalWeeks >= 1 && s.intervalWeeks <= 520))
  );
}
export function nominalDates(s, end) {
  const anchor = new Date(s.anchor + 'T00:00:00Z'),
    limit = new Date(end + 'T00:00:00Z'),
    dates = [];
  if (calendarFrequency(s))
    for (let n = 0; n < 20000; n++) {
      const month = anchor.getUTCMonth() + n * monthStride(s),
        year = anchor.getUTCFullYear(),
        last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
        d = new Date(Date.UTC(year, month, Math.min(s.day, last)));
      if (d > limit) break;
      dates.push(d.toISOString().slice(0, 10));
    }
  else
    for (let d = +anchor, n = 0; d <= +limit && n < 20000; d += dayStride(s) * dayMs, n++)
      dates.push(new Date(d).toISOString().slice(0, 10));
  return dates;
}

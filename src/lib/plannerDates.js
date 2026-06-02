export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEK_START_OPTIONS = DAYS;

export const getOrderedDays = (weekStartDay) => {
  const startIndex = DAYS.indexOf(weekStartDay);
  if (startIndex < 0) return DAYS;
  return [...DAYS.slice(startIndex), ...DAYS.slice(0, startIndex)];
};

export const toDateKey = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const startOfWeek = (date, weekStartDay = "Sunday") => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const startIndex = DAYS.indexOf(weekStartDay);
  const safeStartIndex = startIndex >= 0 ? startIndex : 0;
  const diff = (d.getDay() - safeStartIndex + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
};

export const formatShortDate = (dateKey) => {
  const d = fromDateKey(dateKey);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const formatLongDate = (dateKey) => {
  const d = fromDateKey(dateKey);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

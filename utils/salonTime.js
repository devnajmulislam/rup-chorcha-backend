import { SALON_TIMEZONE, SALON_UTC_OFFSET } from "../config/constants.js";

const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

const salonDateStringFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SALON_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isValidDateString(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!DATE_STRING_REGEX.test(trimmed)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  return (
    utcCheck.getUTCFullYear() === year &&
    utcCheck.getUTCMonth() === month - 1 &&
    utcCheck.getUTCDate() === day
  );
}

function getSalonTodayDateString(now = new Date()) {
  return salonDateStringFormatter.format(now);
}

function formatUtcDateToSalonDateString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return salonDateStringFormatter.format(date);
}

function parseSalonDateToUtcStart(dateStr) {
  const trimmed = typeof dateStr === "string" ? dateStr.trim() : "";
  if (!isValidDateString(trimmed)) {
    throw new Error(`Invalid salon date string: ${dateStr}`);
  }

  return new Date(`${trimmed}T00:00:00.000${SALON_UTC_OFFSET}`);
}

function parseSalonSlotToUtcStart(dateStr, timeSlot) {
  const trimmedDate = typeof dateStr === "string" ? dateStr.trim() : "";
  if (!isValidDateString(trimmedDate)) {
    throw new Error(`Invalid salon date string: ${dateStr}`);
  }

  return new Date(`${trimmedDate}T${timeSlot}:00.000${SALON_UTC_OFFSET}`);
}

function daysBetweenDateStrings(fromDateStr, toDateStr) {
  if (!isValidDateString(fromDateStr) || !isValidDateString(toDateStr)) {
    throw new Error("Cannot compare invalid date strings.");
  }

  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);

  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);

  return Math.round((toUtc - fromUtc) / MS_PER_DAY);
}

function isSlotInPast(dateStr, timeSlot, now = new Date()) {
  return parseSalonSlotToUtcStart(dateStr, timeSlot).getTime() <= now.getTime();
}

export {
  DATE_STRING_REGEX,
  daysBetweenDateStrings,
  formatUtcDateToSalonDateString,
  getSalonTodayDateString,
  isSlotInPast,
  isValidDateString,
  parseSalonDateToUtcStart,
  parseSalonSlotToUtcStart,
};

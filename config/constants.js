const SALON_CATEGORIES = Object.freeze([
  "Haircut & Styling",
  "Hair Coloring",
  "Hair Treatment",
  "Facial & Skincare",
  "Makeup",
  "Manicure & Pedicure",
  "Spa & Massage",
]);

const SERVICE_STATUSES = Object.freeze(["active", "inactive"]);

const SERVICE_SORT_OPTIONS = Object.freeze([
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "name_asc",
  "name_desc",
]);

const ALLOWED_SERVICE_IMAGE_HOSTS = Object.freeze([
  "i.ibb.co",
  "i.ibb.co.com",
  "images.unsplash.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

const ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_PRICE_CENTS = 10_000_000;
const MAX_DURATION_MINUTES = 1440;
const PUBLIC_SERVICES_DEFAULT_LIMIT = 12;
const PUBLIC_SERVICES_MAX_LIMIT = 50;
const ADMIN_SERVICES_DEFAULT_LIMIT = 10;
const ADMIN_SERVICES_MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

const SALON_TIMEZONE = "Asia/Dhaka";
const SALON_UTC_OFFSET = "+06:00";

const TIME_SLOTS = Object.freeze([
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
]);

const APPOINTMENT_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "cancelled",
]);

const ACTIVE_APPOINTMENT_STATUSES = Object.freeze(["pending", "confirmed"]);
const PAYMENT_STATUSES = Object.freeze(["unpaid", "paid"]);
const MAX_BOOKING_ADVANCE_DAYS = 90;
const MAX_APPOINTMENT_MESSAGE_LENGTH = 500;
const CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT = 10;
const CUSTOMER_APPOINTMENTS_MAX_LIMIT = 50;
const ADMIN_APPOINTMENTS_DEFAULT_LIMIT = 10;
const ADMIN_APPOINTMENTS_MAX_LIMIT = 100;
const ADMIN_USERS_DEFAULT_LIMIT = 10;
const ADMIN_USERS_MAX_LIMIT = 100;
const DASHBOARD_RECENT_APPOINTMENTS_LIMIT = 5;
const DASHBOARD_UPCOMING_APPOINTMENTS_LIMIT = 5;
const USER_ACCESS_STATUSES = Object.freeze(["active", "blocked"]);
const MAX_PROFILE_NAME_LENGTH = 80;
const MAX_PROFILE_IMAGE_URL_LENGTH = 2048;
const PHONE_PATTERN = /^[+]?[0-9][0-9\s()-]{5,19}$/;

export {
  ACTIVE_APPOINTMENT_STATUSES,
  ADMIN_APPOINTMENTS_DEFAULT_LIMIT,
  ADMIN_APPOINTMENTS_MAX_LIMIT,
  ADMIN_SERVICES_DEFAULT_LIMIT,
  ADMIN_SERVICES_MAX_LIMIT,
  ADMIN_USERS_DEFAULT_LIMIT,
  ADMIN_USERS_MAX_LIMIT,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_SERVICE_IMAGE_HOSTS,
  APPOINTMENT_STATUSES,
  CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT,
  CUSTOMER_APPOINTMENTS_MAX_LIMIT,
  DASHBOARD_RECENT_APPOINTMENTS_LIMIT,
  DASHBOARD_UPCOMING_APPOINTMENTS_LIMIT,
  MAX_APPOINTMENT_MESSAGE_LENGTH,
  MAX_BOOKING_ADVANCE_DAYS,
  MAX_DURATION_MINUTES,
  MAX_PRICE_CENTS,
  MAX_PROFILE_IMAGE_URL_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_SEARCH_LENGTH,
  PAYMENT_STATUSES,
  PHONE_PATTERN,
  PUBLIC_SERVICES_DEFAULT_LIMIT,
  PUBLIC_SERVICES_MAX_LIMIT,
  SALON_CATEGORIES,
  SALON_TIMEZONE,
  SALON_UTC_OFFSET,
  SERVICE_SORT_OPTIONS,
  SERVICE_STATUSES,
  TIME_SLOTS,
  USER_ACCESS_STATUSES,
};

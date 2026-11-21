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

export {
  ADMIN_SERVICES_DEFAULT_LIMIT,
  ADMIN_SERVICES_MAX_LIMIT,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_SERVICE_IMAGE_HOSTS,
  MAX_DURATION_MINUTES,
  MAX_PRICE_CENTS,
  MAX_SEARCH_LENGTH,
  PUBLIC_SERVICES_DEFAULT_LIMIT,
  PUBLIC_SERVICES_MAX_LIMIT,
  SALON_CATEGORIES,
  SERVICE_SORT_OPTIONS,
  SERVICE_STATUSES,
};

const INDEX_DEFINITIONS = [
  {
    collection: "services",
    specs: [
      { key: { status: 1 }, name: "idx_services_status" },
      { key: { category: 1 }, name: "idx_services_category" },
      { key: { price: 1 }, name: "idx_services_price" },
      { key: { serviceName: 1 }, name: "idx_services_name" },
      { key: { createdAt: -1 }, name: "idx_services_created_at" },
      {
        key: { status: 1, category: 1, price: 1 },
        name: "idx_services_status_category_price",
      },
      {
        key: { status: 1, createdAt: -1 },
        name: "idx_services_status_created_at",
      },
    ],
  },
  {
    collection: "appointments",
    specs: [
      {
        key: { customerId: 1, createdAt: -1 },
        name: "idx_appointments_customer_created",
      },
      { key: { serviceId: 1 }, name: "idx_appointments_service" },
      { key: { status: 1 }, name: "idx_appointments_status" },
      {
        key: { appointmentDate: 1, timeSlot: 1 },
        name: "idx_appointments_date_slot",
      },
      {
        key: { customerId: 1, appointmentDate: 1, timeSlot: 1 },
        name: "uniq_appointments_customer_active_slot",
        unique: true,
        partialFilterExpression: {
          status: { $in: ["pending", "confirmed"] },
        },
      },
    ],
  },
  {
    collection: "transactions",
    specs: [
      {
        key: { stripeSessionId: 1 },
        name: "uniq_transactions_stripe_session",
        unique: true,
        partialFilterExpression: {
          stripeSessionId: { $type: "string" },
        },
      },
      {
        key: { customerId: 1, createdAt: -1 },
        name: "idx_transactions_customer_created",
      },
      { key: { appointmentId: 1 }, name: "idx_transactions_appointment" },
      { key: { status: 1 }, name: "idx_transactions_status" },
      {
        key: { appointmentId: 1 },
        name: "uniq_transactions_paid_appointment",
        unique: true,
        partialFilterExpression: { status: "paid" },
      },
    ],
  },
];

/**
 * Ensures indexes exist idempotently on the business collections.
 * Better Auth collections are left untouched until Part B setup.
 */
async function ensureIndexes(db) {
  for (const { collection, specs } of INDEX_DEFINITIONS) {
    const col = db.collection(collection);
    for (const { key, ...options } of specs) {
      await col.createIndex(key, options);
    }
  }
}

export { INDEX_DEFINITIONS, ensureIndexes };

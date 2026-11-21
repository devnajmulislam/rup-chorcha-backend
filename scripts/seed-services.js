import { SALON_CATEGORIES } from "../config/constants.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDB, connectDB, getCollections } from "../db/mongo.js";

const CURATED_SERVICES = [
  {
    serviceName: "Velvet Blowout & Styling",
    category: "Haircut & Styling",
    description:
      "A nourishing wash, tension-softening scalp massage, and rounded brush blowout tailored for soft volume and lasting movement.",
    price: 4000,
    duration: 45,
    image:
      "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Hydrating Spa Pedicure",
    category: "Manicure & Pedicure",
    description:
      "Warm floral soak, gentle exfoliation, cuticle refinement, soothing lower-leg massage, and a sheer or glossy finish.",
    price: 6500,
    duration: 60,
    image:
      "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Bridal & Occasion Artistry",
    category: "Makeup",
    description:
      "Luminous, camera-ready complexion work and softly sculpted eyes designed to wear comfortably through long celebrations.",
    price: 16500,
    duration: 120,
    image:
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Warm Botanical Massage",
    category: "Spa & Massage",
    description:
      "Slow, restorative full-body massage using warm aromatic oils to quiet tension and restore a calm pace.",
    price: 11000,
    duration: 90,
    image:
      "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Sculpted Manicure",
    category: "Manicure & Pedicure",
    description:
      "Detailed nail shaping, cuticle care, and a flawless finish in the shade that feels most like you.",
    price: 5500,
    duration: 60,
    image:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Soft Glam Makeup",
    category: "Makeup",
    description:
      "An elevated, skin-first look for celebrations, photographs, or an evening that deserves a little more.",
    price: 8000,
    duration: 60,
    image:
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Rose Quartz Facial",
    category: "Facial & Skincare",
    description:
      "A calm, glow-focused facial with gentle exfoliation, hydration, and a restorative facial massage.",
    price: 9500,
    duration: 60,
    image:
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Silk Repair Ritual",
    category: "Hair Treatment",
    description:
      "A restoring treatment for tired hair, finished with a slow scalp massage and a weightless shine.",
    price: 7500,
    duration: 75,
    image:
      "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Luminous Color",
    category: "Hair Coloring",
    description:
      "Dimensional color with a soft, lived-in feel, tailored to your tone and maintained with care.",
    price: 12000,
    duration: 120,
    image:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
  {
    serviceName: "Signature Cut & Finish",
    category: "Haircut & Styling",
    description:
      "A considered consultation, precision cut, and polished finish shaped around your everyday rhythm.",
    price: 4500,
    duration: 60,
    image:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
    status: "active",
  },
];

async function seedServices() {
  const db = await connectDB();
  await ensureIndexes(db);

  const { services } = getCollections();
  const baseTimestamp = Date.now();

  let inserted = 0;
  let skipped = 0;

  for (let index = 0; index < CURATED_SERVICES.length; index += 1) {
    const item = CURATED_SERVICES[index];

    if (!SALON_CATEGORIES.includes(item.category)) {
      throw new Error(`Invalid category in seed data: ${item.category}`);
    }

    const existing = await services.findOne(
      { serviceName: item.serviceName },
      { projection: { _id: 1 } }
    );

    if (existing) {
      skipped += 1;
      continue;
    }

    // Increment timestamps slightly across the ordered array so the last 6 signature
    // services sit cleanly at the top when sorted by newest.
    const timestamp = new Date(baseTimestamp + index * 1000);

    await services.insertOne({
      serviceName: item.serviceName,
      category: item.category,
      description: item.description,
      price: item.price,
      duration: item.duration,
      image: item.image,
      status: item.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    inserted += 1;
  }

  console.log(
    `Service seed complete: ${inserted} inserted, ${skipped} already present (${CURATED_SERVICES.length} curated services checked).`
  );
}

seedServices()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Service seed failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDB().catch(() => {});
  });

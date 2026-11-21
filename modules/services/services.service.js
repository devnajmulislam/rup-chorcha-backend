import { ObjectId } from "mongodb";

import { getCollections } from "../../db/mongo.js";
import { ApiError } from "../../utils/ApiError.js";
import { escapeRegex } from "../../utils/validation.js";

const SERVICE_PROJECTION = Object.freeze({
  _id: 1,
  serviceName: 1,
  category: 1,
  description: 1,
  price: 1,
  duration: 1,
  image: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
});

function toIsoTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSafeService(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id.toString(),
    serviceName: typeof doc.serviceName === "string" ? doc.serviceName.trim() : "",
    category: typeof doc.category === "string" ? doc.category.trim() : "",
    description: typeof doc.description === "string" ? doc.description.trim() : "",
    price: Number(doc.price),
    duration: Number(doc.duration),
    image: typeof doc.image === "string" ? doc.image.trim() : "",
    status: doc.status === "inactive" ? "inactive" : "active",
    createdAt: toIsoTimestamp(doc.createdAt),
    updatedAt: toIsoTimestamp(doc.updatedAt),
  };
}

function buildSortSpec(sort) {
  switch (sort) {
    case "oldest":
      return { createdAt: 1, _id: 1 };
    case "price_asc":
      return { price: 1, _id: 1 };
    case "price_desc":
      return { price: -1, _id: -1 };
    case "name_asc":
      return { serviceName: 1, _id: 1 };
    case "name_desc":
      return { serviceName: -1, _id: -1 };
    case "newest":
    default:
      return { createdAt: -1, _id: -1 };
  }
}

function buildServicesFilter({ search, category, status }) {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.serviceName = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  return filter;
}

function buildPaginationMeta({ page, limit, total, filters }) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1 && total > 0,
    filters,
  };
}

async function queryPaginatedServices({ filter, sort, page, limit, metaFilters }) {
  const { services } = getCollections();
  const skip = (page - 1) * limit;
  const sortSpec = buildSortSpec(sort);

  const [docs, total] = await Promise.all([
    services
      .find(filter, { projection: SERVICE_PROJECTION })
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .toArray(),
    services.countDocuments(filter),
  ]);

  return {
    items: docs.map(toSafeService),
    meta: buildPaginationMeta({
      page,
      limit,
      total,
      filters: metaFilters,
    }),
  };
}

async function listPublicServices({ search, category, sort, page, limit }) {
  const filter = buildServicesFilter({
    status: "active",
    category,
    search,
  });

  return queryPaginatedServices({
    filter,
    sort,
    page,
    limit,
    metaFilters: {
      search: search ?? null,
      category: category ?? null,
      sort,
    },
  });
}

async function getPublicServiceById(serviceId) {
  const { services } = getCollections();
  const doc = await services.findOne(
    {
      _id: new ObjectId(serviceId),
      status: "active",
    },
    { projection: SERVICE_PROJECTION }
  );

  if (!doc) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  return toSafeService(doc);
}

async function listAdminServices({
  search,
  category,
  status,
  sort,
  page,
  limit,
}) {
  const filter = buildServicesFilter({
    status,
    category,
    search,
  });

  return queryPaginatedServices({
    filter,
    sort,
    page,
    limit,
    metaFilters: {
      search: search ?? null,
      category: category ?? null,
      status: status ?? null,
      sort,
    },
  });
}

async function getAdminServiceById(serviceId) {
  const { services } = getCollections();
  const doc = await services.findOne(
    { _id: new ObjectId(serviceId) },
    { projection: SERVICE_PROJECTION }
  );

  if (!doc) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  return toSafeService(doc);
}

async function assertNoDuplicateService({ serviceName, category, excludeId }) {
  const { services } = getCollections();

  const existing = await services.findOne(
    {
      category,
      serviceName: {
        $regex: `^${escapeRegex(serviceName)}$`,
        $options: "i",
      },
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    },
    { projection: { _id: 1 } }
  );

  if (existing) {
    throw new ApiError(
      "A service with this name already exists in the selected category.",
      409,
      { code: "DUPLICATE_SERVICE" }
    );
  }
}

async function createAdminService(input) {
  await assertNoDuplicateService({
    serviceName: input.serviceName,
    category: input.category,
  });

  const { services } = getCollections();
  const now = new Date();

  const doc = {
    serviceName: input.serviceName,
    category: input.category,
    description: input.description,
    price: input.price,
    duration: input.duration,
    image: input.image,
    status: input.status === "inactive" ? "inactive" : "active",
    createdAt: now,
    updatedAt: now,
  };

  const result = await services.insertOne(doc);

  return toSafeService({
    _id: result.insertedId,
    ...doc,
  });
}

async function updateAdminService(serviceId, input) {
  const { services } = getCollections();
  const objectId = new ObjectId(serviceId);

  const existing = await services.findOne(
    { _id: objectId },
    { projection: SERVICE_PROJECTION }
  );

  if (!existing) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  await assertNoDuplicateService({
    serviceName: input.serviceName,
    category: input.category,
    excludeId: objectId,
  });

  const nextImage = input.image || existing.image;
  const nextStatus =
    input.status ?? (existing.status === "inactive" ? "inactive" : "active");
  const now = new Date();

  const updated = await services.findOneAndUpdate(
    { _id: objectId },
    {
      $set: {
        serviceName: input.serviceName,
        category: input.category,
        description: input.description,
        price: input.price,
        duration: input.duration,
        image: nextImage,
        status: nextStatus,
        updatedAt: now,
      },
    },
    {
      returnDocument: "after",
      projection: SERVICE_PROJECTION,
    }
  );

  if (!updated) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  return toSafeService(updated);
}

async function updateAdminServiceStatus(serviceId, status) {
  const { services } = getCollections();
  const objectId = new ObjectId(serviceId);

  const updated = await services.findOneAndUpdate(
    { _id: objectId },
    {
      $set: {
        status,
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      projection: SERVICE_PROJECTION,
    }
  );

  if (!updated) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  return toSafeService(updated);
}

async function deleteAdminService(serviceId) {
  const { services, appointments } = getCollections();
  const objectId = new ObjectId(serviceId);

  const existing = await services.findOne(
    { _id: objectId },
    { projection: SERVICE_PROJECTION }
  );

  if (!existing) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  const referencingCount = await appointments.countDocuments({
    $or: [{ serviceId: objectId }, { serviceId }],
  });

  if (referencingCount > 0) {
    const updated = await services.findOneAndUpdate(
      { _id: objectId },
      {
        $set: {
          status: "inactive",
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        projection: SERVICE_PROJECTION,
      }
    );

    return {
      action: "deactivated",
      id: serviceId,
      service: toSafeService(updated),
      message:
        "This service is referenced by existing appointments, so it was deactivated instead of deleted.",
    };
  }

  await services.deleteOne({ _id: objectId });

  return {
    action: "deleted",
    id: serviceId,
    message: "Service deleted successfully.",
  };
}

export {
  createAdminService,
  deleteAdminService,
  getAdminServiceById,
  getPublicServiceById,
  listAdminServices,
  listPublicServices,
  toSafeService,
  updateAdminService,
  updateAdminServiceStatus,
};

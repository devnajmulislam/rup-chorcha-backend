import { sendSuccess } from "../../utils/apiResponse.js";
import { parseWithSchema } from "../../utils/validation.js";
import { serviceIdParamSchema } from "../services/services.validation.js";
import {
  cancelCustomerPendingAppointment,
  createCustomerAppointment,
  getCustomerAppointmentById,
  getServiceAvailabilityForCustomer,
  listCustomerAppointments,
} from "./appointments.service.js";
import {
  appointmentIdParamSchema,
  availabilityQuerySchema,
  createAppointmentSchema,
  myAppointmentsQuerySchema,
} from "./appointments.validation.js";

async function getServiceAvailabilityHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
      message: "Invalid service ID.",
      code: "INVALID_SERVICE_ID",
    });
    const { date } = parseWithSchema(availabilityQuerySchema, req.query, {
      message: "Invalid availability date query.",
    });

    const data = await getServiceAvailabilityForCustomer({
      serviceId: id,
      customerId: req.user.id,
      dateStr: date,
    });

    return sendSuccess(res, data);
  } catch (error) {
    return next(error);
  }
}

async function createAppointmentHandler(req, res, next) {
  try {
    const body = parseWithSchema(createAppointmentSchema, req.body, {
      message: "Invalid appointment booking request.",
    });

    const created = await createCustomerAppointment({
      customerId: req.user.id,
      ...body,
    });

    return sendSuccess(res, created, { statusCode: 201 });
  } catch (error) {
    return next(error);
  }
}

async function getMyAppointmentsHandler(req, res, next) {
  try {
    const query = parseWithSchema(myAppointmentsQuerySchema, req.query, {
      message: "Invalid appointment filter query.",
    });

    const result = await listCustomerAppointments({
      customerId: req.user.id,
      ...query,
    });

    return sendSuccess(res, result.items, { meta: result.meta });
  } catch (error) {
    return next(error);
  }
}

async function getMyAppointmentByIdHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(appointmentIdParamSchema, req.params, {
      message: "Invalid appointment ID.",
      code: "INVALID_APPOINTMENT_ID",
    });

    const appointment = await getCustomerAppointmentById({
      customerId: req.user.id,
      appointmentId: id,
    });

    return sendSuccess(res, appointment);
  } catch (error) {
    return next(error);
  }
}

async function cancelMyAppointmentHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(appointmentIdParamSchema, req.params, {
      message: "Invalid appointment ID.",
      code: "INVALID_APPOINTMENT_ID",
    });

    const updated = await cancelCustomerPendingAppointment({
      customerId: req.user.id,
      appointmentId: id,
    });

    return sendSuccess(res, updated);
  } catch (error) {
    return next(error);
  }
}

export {
  cancelMyAppointmentHandler,
  createAppointmentHandler,
  getMyAppointmentByIdHandler,
  getMyAppointmentsHandler,
  getServiceAvailabilityHandler,
};

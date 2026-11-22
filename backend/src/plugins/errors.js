// One place that turns every failure into the JSON the frontend expects:
//   { message }                       401/403/404/…
//   { message, errors: {field:[..]} } 422
// Unexpected errors are logged with full detail but never leak internals to the client.
import fp from "fastify-plugin";
import { HttpError, MESSAGES } from "../lib/errors.js";
import { zodToErrors } from "../lib/validate.js";
import { ZodError } from "zod";

const FASTIFY_CODES = {
  FST_ERR_CTP_INVALID_JSON_BODY: [400, "جسم الطلب ليس JSON صالحاً."],
  FST_ERR_CTP_EMPTY_JSON_BODY: [400, "جسم الطلب فارغ."],
  FST_ERR_CTP_INVALID_MEDIA_TYPE: [415, MESSAGES[415]],
  FST_ERR_CTP_BODY_TOO_LARGE: [413, MESSAGES[413]],
  FST_REQ_FILE_TOO_LARGE: [413, MESSAGES[413]],
  FST_FILES_LIMIT: [413, "عدد الملفات أكبر من المسموح."],
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: [400, MESSAGES[400]],
};

export function toResponse(err) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { message: err.message, ...(err.errors ? { errors: err.errors } : {}), ...(err.extra ?? {}) } };
  }
  if (err instanceof ZodError) {
    return { status: 422, body: { message: MESSAGES[422], errors: zodToErrors(err) } };
  }
  if (FASTIFY_CODES[err.code]) {
    const [status, message] = FASTIFY_CODES[err.code];
    return { status, body: { message } };
  }
  if (err.code === "FST_ERR_VALIDATION") {
    return { status: 422, body: { message: MESSAGES[422], errors: { _: [err.message] } } };
  }
  if (err.statusCode === 429) {
    return { status: 429, body: { message: MESSAGES[429] } };
  }
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return { status: err.statusCode, body: { message: MESSAGES[err.statusCode] ?? MESSAGES[400] } };
  }
  return null; // unexpected
}

async function plugin(app) {
  app.setErrorHandler((err, request, reply) => {
    const mapped = toResponse(err);
    if (mapped) {
      if (mapped.status >= 500) request.log.error({ err }, "request failed");
      return reply.status(mapped.status).send(mapped.body);
    }
    request.log.error({ err }, "unhandled error");
    const detail = app.config.isProd ? {} : { debug: String(err?.message ?? err) };
    return reply.status(500).send({ message: MESSAGES[500], ...detail });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ message: `${MESSAGES[404]} ${request.method} ${request.url.split("?")[0]}` });
  });
}

export default fp(plugin, { name: "errors" });

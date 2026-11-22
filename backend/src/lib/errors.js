// Domain errors. Services throw these; plugins/errors.js turns them into the contract's JSON shapes.

export const MESSAGES = {
  400: "طلب غير صالح.",
  401: "غير مصرّح.",
  403: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
  404: "غير موجود.",
  405: "الطريقة غير مسموحة.",
  409: "تعارض مع حالة البيانات الحالية.",
  413: "حجم الملف أكبر من المسموح.",
  415: "نوع المحتوى غير مدعوم.",
  422: "البيانات المدخلة غير صالحة.",
  429: "طلبات كثيرة، حاول لاحقاً.",
  500: "حدث خطأ في الخادم.",
};

export class HttpError extends Error {
  /** @param {number} status @param {string} [message] @param {{errors?: Record<string,string[]>}} [extra] */
  constructor(status, message, extra = {}) {
    super(message ?? MESSAGES[status] ?? MESSAGES[500]);
    this.name = "HttpError";
    this.status = status;
    this.errors = extra.errors;
    this.extra = extra.extra; // additional top-level fields of the JSON body (e.g. the blocked-organization details)
  }
}

export const badRequest = (m) => new HttpError(400, m);
export const unauthorized = (m) => new HttpError(401, m);
export const forbidden = (m) => new HttpError(403, m);
export const notFound = (m) => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

/** Laravel-style 422: `{ message, errors: { field: ["msg"] } }`. */
export class ValidationError extends HttpError {
  constructor(errors, message = MESSAGES[422]) {
    super(422, message, { errors });
    this.name = "ValidationError";
  }
}

/** Shorthand for a single-field failure: `throw fieldError("email", "البريد مستخدم")`. */
export const fieldError = (field, msg, message) => new ValidationError({ [field]: [msg] }, message);

import { post } from "@/lib/http";

/** JSON profile submission. Throws ApiError (with fieldErrors) on any failure. */
export const submitOrganizationProfile = (payload) => post("/organization/o", payload);

/** Supporting documents (PDF/JPG/PNG, <= 5MB each) as multipart/form-data. */
export function uploadOrganizationDocuments(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append("documents[]", f));
  return post("/organization/documents", fd);
}

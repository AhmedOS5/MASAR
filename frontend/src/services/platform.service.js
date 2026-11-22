import { get, post } from "@/lib/http";

// Platform operator console (/operator). Every endpoint requires a platform-admin session; the BFF forwards the cookie.
const enc = encodeURIComponent;
const base = (id) => `/platform/organizations/${enc(id)}`;

/** -> { organizations: { total, by_status }, employees: { total, active }, beneficiaries_reached, health } */
export const getPlatformStats = async () => (await get("/platform/stats")).data;
/** -> { data: [organization], meta: { total, current_page, last_page } } */
export const listOrganizations = (params) => get("/platform/organizations", params);
export const getOrganization = async (id) => (await get(base(id))).data;

/** kind: approve | activate (= approve from suspended / rejected) | reject (reason required) | suspend (reason optional) */
export function decideOrganization(id, kind, reason) {
  if (kind === "approve" || kind === "activate") return post(`${base(id)}/approve`, {});
  return post(`${base(id)}/${kind === "reject" ? "reject" : "suspend"}`, reason ? { reason } : {});
}

/** E-mails a fresh verification code to the organization's admin (the code itself is never returned). */
export const resendAdminVerification = (id) => post(`${base(id)}/resend-verification`, {});

/** Same-origin download link (the BFF adds the session); served as an attachment by the backend. */
export const organizationDocumentUrl = (orgId, docId) => `/api${base(orgId)}/documents/${enc(docId)}/download`;

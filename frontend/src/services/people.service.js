import { get, post, put, del, listOf } from "@/lib/http";

const enc = encodeURIComponent;

export const listEmployees = async (params) => listOf(await get("/employees", params));
export const createEmployee = (body) => post("/employees", body);
export const updateEmployee = (id, body) => put(`/employees/${enc(id)}`, body);
export const deleteEmployee = (id) => del(`/employees/${enc(id)}`);
/** (Re-)sends the invitation code to an employee who has not chosen a password yet -> { message, expires_in_hours } */
export const resendInvite = (id) => post(`/employees/${enc(id)}/invite`, {});

/** Role-assignment history of one employee, newest first: [{ id, action, actor: {id,name}|null, meta: {from,to,category?,previous_source?}, created_at }] */
export const listEmployeeAudit = async (id) => listOf(await get(`/employees/${enc(id)}/audit`));

/** The four fixed job categories with their permission packages: [{ key, label, role_title, view[], edit[], permissions[] }] */
export const listJobCategories = async () => listOf(await get("/job-categories"));

export const listRoles = async () => listOf(await get("/roles"));
export const listPermissions = async () => listOf(await get("/permissions"));
export const createRole = (body) => post("/roles", body);
export const updateRole = (id, body) => put(`/roles/${enc(id)}`, body);

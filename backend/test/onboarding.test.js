import { afterEach, describe, expect, it } from "vitest";
import { testApp, post, bearer, login, newcomer, signedInAdmin, registerVerified, onboardingBody, multipart, filesOnDisk, PDF, PNG, JPG, PASSWORD } from "./helpers.js";
import { hashPassword } from "../src/lib/password.js";
import { sniffMime, cleanFilename } from "../src/lib/uploads.js";
import { contentDisposition } from "../src/lib/http-files.js";

let app;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const me = async (a) => (await app.inject({ url: "/auth/me", headers: a.headers })).json();

describe("POST /organization/o", () => {
  it("stores the profile, moves the org to pending_approval, and /auth/me reflects it", async () => {
    app = await testApp();
    const a = await newcomer(app);
    expect((await me(a)).user.onboarding_status).toBe("incomplete");

    const res = await post(app, "/organization/o", onboardingBody(), a.headers);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ ok: true, onboarding_status: "pending_approval" });

    expect((await me(a)).user.onboarding_status).toBe("pending_approval");
    const profile = await app.db("organization_profiles").first();
    expect(profile).toMatchObject({
      organization_id: a.organizationId,
      registration_number: "REG-123",
      country: "PS",
      contact_person_name: "ليلى المحمود",
      organization_size: "small",
      years_of_experience: 5,
    });
    expect(JSON.parse(profile.sectors)).toEqual(["water", "health"]);
    expect(profile.submitted_at).toBeTruthy();
  });

  // Volunteer management is out of scope: the column is gone. An older client that still sends the field is not rejected —
  // the value is simply not stored (and never returned).
  it("does not store volunteers_count any more, but still accepts it from older clients", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await post(app, "/organization/o", onboardingBody({ volunteers_count: "50" }), a.headers);
    expect(res.statusCode).toBe(201);
    expect(await app.db("organization_profiles").first()).not.toHaveProperty("volunteers_count");
  });

  it("updates the official e-mail/phone but keeps the locked name and type", async () => {
    app = await testApp();
    const a = await newcomer(app);
    await post(app, "/organization/o", onboardingBody({ organization_name: "Hacked Name", organization_type: "gov" }), a.headers);
    expect(await app.db("organizations").first()).toMatchObject({
      name: "منظمة النور",
      type: "ngo",
      email: "official@alnoor.org",
      phone: "+970 59 111 2222",
    });
  });

  it("tolerates blanks/nulls for the optional fields", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await post(app, "/organization/o", onboardingBody({ address: "", sectors: null, organization_size: "", years_of_experience: "", notes: null }), a.headers);
    expect(res.statusCode).toBe(201);
    const p = await app.db("organization_profiles").first();
    expect(p).toMatchObject({ address: null, organization_size: null, years_of_experience: null, notes: null });
    expect(JSON.parse(p.sectors)).toEqual([]);
  });

  it("422 with Laravel-shaped errors keyed by the backend field names", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await post(app, "/organization/o", {}, a.headers);
    expect(res.statusCode).toBe(422);
    const { errors } = res.json();
    for (const f of ["registration_number", "country", "phone", "email", "contact_person_name"]) expect(errors[f], f).toEqual([expect.any(String)]);
    expect(errors.organization_name).toBeUndefined(); // locked fields are not required
    expect((await me(a)).user.onboarding_status).toBe("incomplete"); // nothing changed
  });

  it.each([
    ["free-mail e-mail", { email: "ngo@gmail.com" }, "email"],
    ["bad e-mail", { email: "nope" }, "email"],
    ["short phone", { phone: "123" }, "phone"],
    ["absurd experience", { years_of_experience: 5000 }, "years_of_experience"],
    ["sectors not an array", { sectors: "water" }, "sectors"],
    ["bad organization_type", { organization_type: "bank" }, "organization_type"],
  ])("rejects %s", async (_n, over, field) => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await post(app, "/organization/o", onboardingBody(over), a.headers);
    expect(res.statusCode).toBe(422);
    expect(res.json().errors[field]).toBeTruthy();
  });

  it("409 on a second submission (no overwrite), also once approved", async () => {
    app = await testApp();
    const a = await newcomer(app);
    expect((await post(app, "/organization/o", onboardingBody(), a.headers)).statusCode).toBe(201);
    const again = await post(app, "/organization/o", onboardingBody({ registration_number: "CHANGED" }), a.headers);
    expect(again.statusCode).toBe(409);
    expect((await app.db("organization_profiles").first()).registration_number).toBe("REG-123");

    await app.db("organizations").update({ status: "approved" });
    expect((await post(app, "/organization/o", onboardingBody(), a.headers)).statusCode).toBe(409);
  });

  it("concurrent submissions: exactly one wins", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const results = await Promise.all(Array.from({ length: 4 }, () => post(app, "/organization/o", onboardingBody(), a.headers)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409]);
  });

  it("401 without a token; 403 for a non-admin member or a platform operator", async () => {
    app = await testApp();
    const a = await newcomer(app);
    expect((await post(app, "/organization/o", onboardingBody())).statusCode).toBe(401);

    await app.db("users").insert({ organization_id: a.organizationId, name: "Staff", email: "staff@org.org", password_hash: await hashPassword(PASSWORD, { logN: 10 }), email_verified_at: new Date().toISOString() });
    const staff = bearer((await login(app, "staff@org.org")).json().token);
    expect((await post(app, "/organization/o", onboardingBody(), staff)).statusCode).toBe(403);

    await app.orgService.createPlatformAdmin({ email: "ops@masar.io", name: "Ops", password: PASSWORD });
    const ops = bearer((await login(app, "ops@masar.io")).json().token);
    expect((await post(app, "/organization/o", onboardingBody(), ops)).statusCode).toBe(403);
  });
});

describe("POST /organization/documents", () => {
  const upload = (a, parts) => {
    const m = multipart(parts);
    return app.inject({ method: "POST", url: "/organization/documents", payload: m.payload, headers: { ...a.headers, ...m.headers } });
  };
  const doc = (name, type, content, field = "documents[]") => ({ name: field, filename: name, type, content });

  it("stores PDF/PNG/JPG sent as documents[] (after the profile, as the form does)", async () => {
    app = await testApp();
    const a = await newcomer(app);
    await post(app, "/organization/o", onboardingBody(), a.headers);

    const res = await upload(a, [doc("ترخيص.pdf", "application/pdf", PDF), doc("a.png", "image/png", PNG), doc("b.jpg", "image/jpeg", JPG)]);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ stored: 3 });

    const rows = await app.db("attachments").orderBy("id");
    expect(rows.map((r) => [r.name, r.mime, r.attachable_type, r.organization_id])).toEqual([
      ["ترخيص.pdf", "application/pdf", "organization", a.organizationId],
      ["a.png", "image/png", "organization", a.organizationId],
      ["b.jpg", "image/jpeg", "organization", a.organizationId],
    ]);
    expect(rows[0].size).toBe(PDF.length);
    expect(filesOnDisk(app)).toHaveLength(3);
    for (const r of rows) expect(await app.storage.exists(r.storage_key)).toBe(true);
  });

  it("also accepts the plain field name `documents` and works before the profile is submitted", async () => {
    app = await testApp();
    const a = await newcomer(app);
    expect((await upload(a, [doc("x.pdf", "application/pdf", PDF, "documents")])).statusCode).toBe(201);
  });

  it("decides the type from the content, not the client's claim", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await upload(a, [doc("virus.pdf", "application/pdf", "<html><script>alert(1)</script></html>")]);
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.documents[0]).toMatch(/virus\.pdf/);
    expect(filesOnDisk(app)).toHaveLength(0);

    // a real PNG mislabelled as PDF is stored as what it is
    expect((await upload(a, [doc("img.pdf", "application/pdf", PNG)])).statusCode).toBe(201);
    expect((await app.db("attachments").first()).mime).toBe("image/png");
  });

  it("is all-or-nothing: one bad file leaves no rows and no files", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const res = await upload(a, [doc("ok.pdf", "application/pdf", PDF), doc("bad.exe", "application/octet-stream", "MZ not allowed"), doc("ok2.png", "image/png", PNG)]);
    expect(res.statusCode).toBe(422);
    expect(Number((await app.db("attachments").count({ n: "*" }).first()).n)).toBe(0);
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("413 above 5 MB, cleaning up the partial file", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(a, [doc("big.pdf", "application/pdf", big)]);
    expect(res.statusCode).toBe(413);
    expect(res.json().message).toBeTruthy();
    expect(filesOnDisk(app)).toHaveLength(0);
    expect(Number((await app.db("attachments").count({ n: "*" }).first()).n)).toBe(0);
  });

  it("422 when no file / empty file / wrong field name / not multipart", async () => {
    app = await testApp();
    const a = await newcomer(app);
    expect((await upload(a, [{ name: "note", value: "hi" }])).statusCode).toBe(422);
    expect((await upload(a, [doc("empty.pdf", "application/pdf", "")])).statusCode).toBe(422);
    expect((await upload(a, [doc("x.pdf", "application/pdf", PDF, "avatar")])).statusCode).toBe(422);
    expect((await post(app, "/organization/documents", {}, a.headers)).statusCode).toBe(422);
    expect(filesOnDisk(app)).toHaveLength(0);
  });

  it("caps the total at 20 documents per organization", async () => {
    app = await testApp();
    const a = await newcomer(app);
    for (let i = 0; i < 2; i++) expect((await upload(a, Array.from({ length: 10 }, (_, j) => doc(`d${i}${j}.pdf`, "application/pdf", PDF)))).statusCode).toBe(201);
    const res = await upload(a, [doc("one-too-many.pdf", "application/pdf", PDF)]);
    expect(res.statusCode).toBe(422);
    expect(filesOnDisk(app)).toHaveLength(20);
  });

  it("409 after approval; 401 anonymous; 403 for a non-admin member", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const m = multipart([doc("x.pdf", "application/pdf", PDF)]);
    expect((await app.inject({ method: "POST", url: "/organization/documents", payload: m.payload, headers: m.headers })).statusCode).toBe(401);

    await app.db("organizations").update({ status: "approved" });
    expect((await upload(a, [doc("x.pdf", "application/pdf", PDF)])).statusCode).toBe(409);
    expect(filesOnDisk(app)).toHaveLength(0);

    await app.db("organizations").update({ status: "incomplete" });
    await app.db("users").insert({ organization_id: a.organizationId, name: "S", email: "s@org.org", password_hash: await hashPassword(PASSWORD, { logN: 10 }), email_verified_at: new Date().toISOString() });
    const staff = { headers: bearer((await login(app, "s@org.org")).json().token) };
    expect((await upload(staff, [doc("x.pdf", "application/pdf", PDF)])).statusCode).toBe(403);
  });
});

describe("upload helpers", () => {
  it("sniffMime recognises PDF, PNG and JPEG only", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPG)).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });

  it("cleanFilename strips paths and control characters", () => {
    expect(cleanFilename("..\\..\\etc/passwd")).toBe("passwd");
    expect(cleanFilename('a"b\u0000c.pdf')).toBe("abc.pdf");
    expect(cleanFilename("")).toBe("file");
    expect(cleanFilename("x".repeat(500))).toHaveLength(200);
  });

  it("contentDisposition keeps Arabic names via filename*", () => {
    const h = contentDisposition("تقرير (1).pdf");
    expect(h).toContain("attachment;");
    expect(h).toContain("filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1%20%281%29.pdf");
    expect(h).not.toMatch(/[؀-ۿ]/);
  });
});

describe("tenant isolation of uploads", () => {
  it("each organization's documents land in its own folder", async () => {
    app = await testApp();
    const a = await newcomer(app);
    const b = await newcomer(app, { admin_email: "b@other.org", organization_name: "B" });
    for (const u of [a, b]) {
      const m = multipart([{ name: "documents[]", filename: "x.pdf", type: "application/pdf", content: PDF }]);
      await app.inject({ method: "POST", url: "/organization/documents", payload: m.payload, headers: { ...u.headers, ...m.headers } });
    }
    const keys = (await app.db("attachments").orderBy("id")).map((r) => r.storage_key);
    expect(keys[0]).toMatch(new RegExp(`^org-${a.organizationId}/documents/`));
    expect(keys[1]).toMatch(new RegExp(`^org-${b.organizationId}/documents/`));
    void signedInAdmin;
    void registerVerified;
  });
});

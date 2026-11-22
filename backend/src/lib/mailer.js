// Outgoing mail behind one interface: send({ to, subject, text, html? }).
//   smtp     nodemailer, configured from SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM
//   console  development & tests: keeps the message in `outbox` (nothing leaves the machine)
//   none     drop silently
// MAIL_TRANSPORT=auto (default) picks smtp as soon as SMTP_HOST is set. Production refuses to start without SMTP.
export function createMailer(env, log, loadNodemailer = async () => (await import("nodemailer")).default) {
  const outbox = [];
  let transport;

  const smtpOptions = () => ({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
  });

  async function smtp() {
    if (!transport) transport = (await loadNodemailer()).createTransport(smtpOptions());
    return transport;
  }

  async function send(message) {
    const mail = { from: env.SMTP_FROM, ...message };
    switch (env.mailTransport) {
      case "none":
        return;
      case "smtp":
        await (await smtp()).sendMail(mail);
        return;
      default:
        outbox.push(mail);
        if (outbox.length > 200) outbox.shift();
        log?.info({ to: mail.to, subject: mail.subject }, "[mail] captured by the console transport (not delivered)");
    }
  }

  return {
    outbox,
    transport: env.mailTransport,
    send,
    /** Fire-and-forget wrapper: a mail failure must never fail the request that triggered it. */
    sendSafe(message) {
      return send(message).catch((err) => {
        log?.error({ err, to: message.to }, "mail delivery failed");
      });
    },
    /** Checks the SMTP connection/credentials (used at start-up; resolves false instead of throwing). */
    async verify() {
      if (env.mailTransport !== "smtp") return true;
      try {
        await (await smtp()).verify();
        return true;
      } catch (err) {
        log?.error({ err }, "SMTP connection check failed");
        return false;
      }
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Platform decision on an organization: kind = approve | reject | suspend. */
export function orgDecisionEmail({ name, organizationName, kind, reason, loginUrl }) {
  const because = reason ? ` السبب: ${reason}` : "";
  const [subject, body] = {
    approve: ["تم اعتماد مؤسستك - مسار", `تم اعتماد منظمة «${organizationName}» في منصة مسار. يمكنك تسجيل الدخول والبدء باستخدام المنصة:`],
    reject: ["تعذّر اعتماد مؤسستك - مسار", `نأسف، لم يتم اعتماد منظمة «${organizationName}».${because}`],
    suspend: ["تم تعليق حساب مؤسستك - مسار", `تم تعليق حساب منظمة «${organizationName}».${because}`],
  }[kind];
  const text = [`مرحباً ${name}،`, "", body, ...(kind === "approve" ? [loginUrl] : []), "", "فريق مسار"].join("\n");
  const link = kind === "approve" ? `<p><a href="${esc(loginUrl)}">تسجيل الدخول</a></p>` : "";
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif"><p>مرحباً ${esc(name)}،</p><p>${esc(body)}</p>${link}<p style="color:#666">فريق مسار</p></div>`;
  return { subject, text, html };
}

/**
 * Invitation of an employee added by an organization admin. The plain text contains exactly one 6-digit number: the code.
 * `setPasswordUrl` is only the address of the page (the e-mail is pre-filled); the secret is the code, typed by hand.
 */
export function inviteEmail({ name, organizationName, code, ttlHours, setPasswordUrl }) {
  const subject = `دعوة للانضمام إلى ${organizationName} - مسار`;
  const days = ttlHours % 24 === 0 ? ttlHours / 24 : 0;
  const validity = days === 1 ? "يوم واحد" : days === 2 ? "يومين" : days >= 3 && days <= 10 ? `${days} أيام` : `${ttlHours} ساعة`;
  const text = [
    `مرحباً ${name}،`,
    "",
    `تمت إضافتك إلى منظمة «${organizationName}» على منصة مسار. لتفعيل حسابك واختيار كلمة المرور، افتح الصفحة التالية:`,
    setPasswordUrl,
    "",
    "وأدخل رمز التفعيل التالي:",
    "",
    code,
    "",
    `ينتهي هذا الرمز خلال ${validity}. إن انتهى فاطلب من مدير المنظمة إرسال دعوة جديدة.`,
    "",
    "لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.",
    "إذا لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة.",
    "",
    "فريق مسار",
  ].join("\n");
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a;line-height:1.8">
<h2 style="margin:0 0 8px;color:#1e3a8a">دعوة للانضمام</h2>
<p>مرحباً ${esc(name)}،</p>
<p>تمت إضافتك إلى منظمة «${esc(organizationName)}» على منصة مسار. لتفعيل حسابك واختيار كلمة المرور، افتح <a href="${esc(setPasswordUrl)}">صفحة التفعيل</a> وأدخل رمز التفعيل التالي:</p>
<p style="text-align:center;margin:24px 0"><span dir="ltr" style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;font-family:Consolas,Menlo,monospace;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:12px 24px">${esc(code)}</span></p>
<p>ينتهي هذا الرمز خلال <b>${esc(validity)}</b>. إن انتهى فاطلب من مدير المنظمة إرسال دعوة جديدة.</p>
<p style="color:#b91c1c">لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.</p>
<p style="color:#64748b;font-size:13px">إذا لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة.</p>
<p style="color:#64748b">فريق مسار</p></div>`;
  return { subject, text, html };
}

/**
 * Password reset code. The plain text contains exactly one 6-digit number: the code. `resetUrl` is only the address of
 * the page (the e-mail is pre-filled); the secret is the code, typed by hand.
 */
export function passwordResetEmail({ name, code, ttlMinutes, resetUrl }) {
  const subject = "رمز إعادة تعيين كلمة المرور - مسار";
  const text = [
    `مرحباً ${name}،`,
    "",
    "وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك في منصة مسار. افتح الصفحة التالية:",
    resetUrl,
    "",
    "وأدخل رمز إعادة التعيين التالي:",
    "",
    code,
    "",
    `ينتهي هذا الرمز خلال ${ttlMinutes} دقيقة ويُستخدم مرة واحدة.`,
    "",
    "لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.",
    "إذا لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك الحالية لم تتغير ولا يمكن لأحد تغييرها بدون هذا الرمز.",
    "",
    "فريق مسار",
  ].join("\n");
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a;line-height:1.8">
<h2 style="margin:0 0 8px;color:#1e3a8a">إعادة تعيين كلمة المرور</h2>
<p>مرحباً ${esc(name)}،</p>
<p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك في منصة مسار. افتح <a href="${esc(resetUrl)}">صفحة إعادة التعيين</a> وأدخل الرمز التالي:</p>
<p style="text-align:center;margin:24px 0"><span dir="ltr" style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;font-family:Consolas,Menlo,monospace;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:12px 24px">${esc(code)}</span></p>
<p>ينتهي هذا الرمز خلال <b>${esc(ttlMinutes)}</b> دقيقة ويُستخدم مرة واحدة.</p>
<p style="color:#b91c1c">لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.</p>
<p style="color:#64748b;font-size:13px">إذا لم تطلب ذلك فتجاهل هذه الرسالة؛ كلمة مرورك الحالية لم تتغير ولا يمكن لأحد تغييرها بدون هذا الرمز.</p>
<p style="color:#64748b">فريق مسار</p></div>`;
  return { subject, text, html };
}

/** Sent after a successful reset, so an owner who did NOT ask for it notices. Contains no code and no link to act on. */
export function passwordChangedEmail({ name }) {
  const subject = "تم تغيير كلمة مرور حسابك - مسار";
  const text = [
    `مرحباً ${name}،`,
    "",
    "تم تغيير كلمة المرور الخاصة بحسابك في منصة مسار، وتم إنهاء جميع جلسات الدخول السابقة.",
    "",
    "إذا كنت أنت من قام بذلك فلا حاجة لأي إجراء.",
    "إذا لم تكن أنت، فتواصل فوراً مع مدير المنظمة أو فريق الدعم.",
    "",
    "فريق مسار",
  ].join("\n");
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a;line-height:1.8">
<h2 style="margin:0 0 8px;color:#1e3a8a">تم تغيير كلمة المرور</h2>
<p>مرحباً ${esc(name)}،</p>
<p>تم تغيير كلمة المرور الخاصة بحسابك في منصة مسار، وتم إنهاء جميع جلسات الدخول السابقة.</p>
<p>إذا كنت أنت من قام بذلك فلا حاجة لأي إجراء.</p>
<p style="color:#b91c1c">إذا لم تكن أنت، فتواصل فوراً مع مدير المنظمة أو فريق الدعم.</p>
<p style="color:#64748b">فريق مسار</p></div>`;
  return { subject, text, html };
}

/** E-mail verification code (OTP). The plain text contains exactly one 6-digit number: the code. */
export function otpEmail({ name, organizationName, code, ttlMinutes }) {
  const subject = "رمز التحقق من بريدك الإلكتروني - مسار";
  const text = [
    `مرحباً ${name}،`,
    "",
    `شكراً لتسجيل منظمة «${organizationName}» في منصة مسار. رمز التحقق الخاص بك هو:`,
    "",
    code,
    "",
    `ينتهي هذا الرمز خلال ${ttlMinutes} دقيقة. أدخله في صفحة التحقق لتفعيل بريدك الإلكتروني.`,
    "",
    "لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.",
    "إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.",
    "",
    "فريق مسار",
  ].join("\n");
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a;line-height:1.8">
<h2 style="margin:0 0 8px;color:#1e3a8a">تأكيد البريد الإلكتروني</h2>
<p>مرحباً ${esc(name)}،</p>
<p>شكراً لتسجيل منظمة «${esc(organizationName)}» في منصة مسار. رمز التحقق الخاص بك هو:</p>
<p style="text-align:center;margin:24px 0"><span dir="ltr" style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;font-family:Consolas,Menlo,monospace;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:12px;padding:12px 24px">${esc(code)}</span></p>
<p>ينتهي هذا الرمز خلال <b>${esc(ttlMinutes)}</b> دقيقة. أدخله في صفحة التحقق لتفعيل بريدك الإلكتروني.</p>
<p style="color:#b91c1c">لأمان حسابك: لا تشارك هذا الرمز مع أي شخص — فريق مسار لن يطلبه منك أبداً.</p>
<p style="color:#64748b;font-size:13px">إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.</p>
<p style="color:#64748b">فريق مسار</p></div>`;
  return { subject, text, html };
}

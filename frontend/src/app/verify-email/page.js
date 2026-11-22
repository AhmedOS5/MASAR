"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import StepperHeader from "./_components/StepperHeader/StepperHeader";
import VerifyCard from "./_components/VerifyCard/VerifyCard";
import { resendVerificationCode, verifyEmail } from "@/services/auth.service";
import { OTP_LENGTH, toOtpDigits } from "@/lib/otp";

const RESEND_COOLDOWN = 60;
const CODE_LENGTH = OTP_LENGTH;
const toDigits = toOtpDigits;

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  // Coming from the login page ("verify your e-mail"): the old code may have expired, so allow asking for a new one at once.
  const resendNow = searchParams.get("resend") === "1";

  const [code, setCode] = useState("");
  const [timer, setTimer] = useState(resendNow ? 0 : RESEND_COOLDOWN);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const goToSuccess = useCallback(() => {
    router.push(`/activation-success?email=${encodeURIComponent(email)}`);
  }, [router, email]);

  const handleCodeChange = useCallback((value) => {
    setCode(toDigits(value));
    setVerifyError("");
  }, []);

  const handleVerify = useCallback(async () => {
    if (isVerifying || !email || code.length !== CODE_LENGTH) return;
    setIsVerifying(true);
    setVerifyError("");
    setError("");
    setMessage("");
    try {
      const result = await verifyEmail({ email, code });
      if (result?.verified) goToSuccess();
      else setVerifyError("تعذر التحقق من الرمز. حاول مرة أخرى.");
    } catch (err) {
      if (err?.status === 429) {
        // five wrong attempts: this code is dead, a new one is required
        setLocked(true);
        setCode("");
      }
      setVerifyError(err?.fieldErrors?.code || err?.message || "تعذر التحقق من الرمز. حاول مرة أخرى.");
    } finally {
      setIsVerifying(false);
    }
  }, [isVerifying, email, code, goToSuccess]);

  const handleResend = useCallback(async () => {
    if (timer > 0 || isLoading || !email) return;
    setIsLoading(true);
    setError("");
    setMessage("");
    setVerifyError("");
    try {
      const data = await resendVerificationCode(email);
      setMessage(data?.message || "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني.");
      setTimer(data?.resend_after_seconds ?? RESEND_COOLDOWN);
      setCode("");
      setLocked(false);
    } catch (err) {
      // "يرجى الانتظار 42 ثانية…" -> start the visible countdown from the server's number
      const wait = Number(/(\d+)\s*ثانية/.exec(err?.message ?? "")?.[1]);
      if (err?.status === 429 && wait > 0) setTimer(wait);
      if (err?.status === 400) {
        // already verified: nothing left to do here
        setMessage(err.message);
        setTimeout(goToSuccess, 800);
      } else {
        setError(err?.message || "تعذر إرسال رمز جديد.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [timer, isLoading, email, goToSuccess]);

  return (
    <div style={{ backgroundColor: "#f4f6fa", minHeight: "100vh", direction: "rtl" }}>
      <StepperHeader />
      <VerifyCard
        email={email}
        code={code}
        codeLength={CODE_LENGTH}
        onCodeChange={handleCodeChange}
        timer={timer}
        isLoading={isLoading}
        isVerifying={isVerifying}
        locked={locked}
        onResend={handleResend}
        onVerify={handleVerify}
        error={error}
        message={message}
        verifyError={verifyError}
      />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            backgroundColor: "#f4f6fa",
            direction: "rtl",
          }}
        >
          جاري التحميل...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

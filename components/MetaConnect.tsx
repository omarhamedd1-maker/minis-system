"use client";

import { useEffect, useRef, useState } from "react";
import type { SignupAssets } from "@/lib/inbox/meta-oauth";

/**
 * زرار «اربط حساباتك» — نفس فكرة زرار شوبيفاي.
 *
 * ⚠️⚠️ **الكود اللي بيرجع من ميتا بيعيش ٣٠ ثانية.** عشان كده بيتبعت
 * للسيرفر فورًا في نفس اللحظة — مش بيتحط في حقل ولا بيستنى دوسة تانية.
 *
 * ⚠️ **ومعلومات الحساب بتيجي في رسالة منفصلة عن الكود** (حدث `message` من
 * شباك ميتا)، وبتوصل **قبل** الكود. فبنمسكها في مرجع ونستنى الكود.
 * اللي بيقرا الاتنين كأنهم حاجة واحدة بيلاقي المعرّفات فاضية دايمًا.
 */
export function MetaConnect({
  appId,
  configId,
  action,
}: {
  appId: string;
  configId: string;
  action: (assets: SignupAssets) => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useRef<Partial<SignupAssets>>({});

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // ⚠️ الرسالة دي بتيجي من نطاق فيسبوك بس — أي حاجة تانية بتتساب
      if (!/^https:\/\/www\.facebook\.com$/.test(event.origin)) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        const d = data.data ?? {};
        session.current = {
          wabaId: d.waba_id ?? null,
          phoneNumberId: d.phone_number_id ?? null,
          businessId: d.business_id ?? null,
          pageId: Array.isArray(d.page_ids) ? d.page_ids[0] : null,
          instagramAccountId: Array.isArray(d.instagram_account_ids)
            ? d.instagram_account_ids[0]
            : null,
        };
      } catch {
        // رسالة مش بتاعتنا — نسيبها
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      FB?: { init: (o: Record<string, unknown>) => void };
      fbAsyncInit?: () => void;
    };

    const boot = () => {
      w.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" });
      setReady(true);
    };

    if (w.FB) {
      boot();
      return;
    }

    w.fbAsyncInit = boot;
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    document.body.appendChild(s);
  }, [appId]);

  const start = () => {
    const w = window as unknown as {
      FB?: {
        login: (
          cb: (r: { authResponse?: { code?: string } }) => void,
          opts: Record<string, unknown>
        ) => void;
      };
    };
    if (!w.FB) return;

    setBusy(true);
    w.FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setBusy(false);
          return;
        }
        // فورًا — الكود بيموت بعد ٣٠ ثانية
        action({
          code,
          wabaId: session.current.wabaId ?? null,
          phoneNumberId: session.current.phoneNumberId ?? null,
          businessId: session.current.businessId ?? null,
          pageId: session.current.pageId ?? null,
          instagramAccountId: session.current.instagramAccountId ?? null,
        }).finally(() => setBusy(false));
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      }
    );
  };

  return (
    <button
      type="button"
      onClick={start}
      disabled={!ready || busy}
      className="rounded-control bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5] disabled:opacity-60"
    >
      {busy ? "بيربط…" : ready ? "اربط حساباتك" : "بيحمّل…"}
    </button>
  );
}

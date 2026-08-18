// ==========================================================================
// اختبار مسار ويب هوك بوسطة
// --------------------------------------------------------------------------
// **اللي بيتحرس هنا حاجة واحدة مهمة**: البيزنس بيطلع من **رقم التتبع**، مش
// من أي حاجة في جسم الطلب.
//
// الدالة القديمة في سوبابيز كانت بتلاقي الأوردر برقمه (`order_number`) من
// غير فلتر بيزنس — و**مينيز و٢ سِك بينهم ١٤٠ رقم مشترك**. يعني شحنة عند
// بيزنس كانت بتحرّك أوردر عند بيزنس تاني. الاختبار ده بيمنع رجوع الفكرة
// دي: لو حد بدّل البحث لرقم الأوردر، الحالة الأولى هتقع.
// ==========================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.fn();
let row: { tenant_id: string } | null = null;
/** مفتاح بيزنس مقبول — غير المفتاح المشترك */
let tenantToken: string | null = null;
let asked: { table: string; column: string; value: unknown } | null = null;

vi.mock("@/lib/bosta/sync", () => ({
  runBostaSync: (...a: unknown[]) => sync(...a),
  BostaNotLinked: class extends Error {},
}));

/** آخر مزامنة اتسجّلت للبيزنس — بتتقرا من `sync_runs` عشان المهلة */
let lastRunAt: string | null = null;

vi.mock("@/lib/bosta/sync-runs", () => ({ recordSyncRun: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => {
  // `sync_runs` بتتقرا بسلسلة أطول (`order` و`limit`)، فالموك بيرجّع
  // نفسه لأي دالة وسط والقراية بتحصل في `maybeSingle`
  const chain = (table: string, column: string, value: unknown) => {
    const self: Record<string, unknown> = {};
    const same = () => self;
    self.select = same;
    self.eq = (c: string, v: unknown) =>
      table === "sync_runs" ? self : chain(table, c, v);
    self.order = same;
    self.limit = same;
    self.maybeSingle = async () => {
      if (table === "sync_runs") {
        return { data: lastRunAt ? { created_at: lastRunAt } : null };
      }
      // مفتاح البيزنس جدول تاني — مابيتسجّلش في `asked` عشان الاختبارات
      // تفضل بتراقب البحث عن الأوردر
      if (table === "tenant_credentials") {
        return {
          data:
            tenantToken && value === tenantToken ? { tenant_id: "t-token" } : null,
        };
      }
      asked = { table, column, value };
      return { data: row };
    };
    return self;
  };

  return {
    createAdminClient: () => ({
      from: (table: string) => chain(table, "", undefined),
    }),
  };
});

// **`after` بينفّذ على طول هنا** — إحنا عايزين نشوف المزامنة اتندهت ولا لأ
vi.mock("next/server", async () => {
  const real = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...real, after: (fn: () => unknown) => fn() };
});

const KEY = "مفتاح-تجربة";
const URL_OK = `https://x/api/bosta/webhook?key=${encodeURIComponent(KEY)}`;

function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

describe("ويب هوك بوسطة", () => {
  beforeEach(() => {
    vi.resetModules();
    sync.mockReset();
    row = null;
    asked = null;
    tenantToken = null;
    lastRunAt = null;
    process.env.BOSTA_WEBHOOK_KEY = KEY;
  });

  async function POST(req: Request) {
    return (await import("./route")).POST(req);
  }

  it("**بيدوّر برقم التتبع** — مش برقم الأوردر", async () => {
    row = { tenant_id: "t-2sec" };
    await POST(post(URL_OK, { trackingNumber: "77778888", businessReference: "1355" }));

    expect(asked).toEqual({
      table: "orders",
      column: "bosta_tracking",
      value: "77778888",
    });
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-2sec" })
    );
  });

  it("شحنة مش عندنا؟ **مافيش مزامنة** — والرد ٢٠٠ عشان بوسطة ماتعيدش", async () => {
    row = null;
    const res = await POST(post(URL_OK, { trackingNumber: "لا-أحد" }));

    expect(res.status).toBe(200);
    expect(sync).not.toHaveBeenCalled();
  });

  it("مفتاح غلط؟ ٤٠١ ومافيش بحث عن أوردر", async () => {
    const res = await POST(post("https://x/api/bosta/webhook?key=غلط", {}));

    expect(res.status).toBe(401);
    expect(asked).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it("**مفتاح البيزنس بيعدّي زي المشترك**", async () => {
    tenantToken = "مفتاح-بيزنس";
    row = { tenant_id: "t-2sec" };
    const res = await POST(
      post(
        `https://x/api/bosta/webhook?key=${encodeURIComponent(tenantToken)}`,
        { trackingNumber: "77778888" }
      )
    );

    expect(res.status).toBe(200);
    // ⚠️ **البيزنس بييجي من رقم التتبع مش من المفتاح** — المفتاح بوّاب بس
    expect(sync).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-2sec" })
    );
  });

  it("مفتاح بيزنس تاني مش مسجّل؟ ٤٠١", async () => {
    tenantToken = "مفتاح-بيزنس";
    const res = await POST(
      post("https://x/api/bosta/webhook?key=مفتاح-مش-موجود", {
        trackingNumber: "77778888",
      })
    );

    expect(res.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("مفيش مفتاح خالص؟ ٤٠١ من غير ما نسأل الداتابيز", async () => {
    const res = await POST(post("https://x/api/bosta/webhook", {}));

    expect(res.status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("مفيش رقم تتبع؟ ٢٠٠ من غير مزامنة — الإعادة مش هتخلق رقم", async () => {
    const res = await POST(post(URL_OK, { businessReference: "1355" }));

    expect(res.status).toBe(200);
    expect(sync).not.toHaveBeenCalled();
  });

  it("رقم التتبع بييجي جوه `delivery` كمان", async () => {
    row = { tenant_id: "t-minis" };
    await POST(post(URL_OK, { delivery: { trackingNumber: "12341234" } }));

    expect(asked?.value).toBe("12341234");
  });
});

// ==========================================================================
// المهلة — عشان الرشقة ماتشغّلش عشر مزامنات كاملة
// --------------------------------------------------------------------------
// بعد ما بقينا بنبعت `webhookUrl` مع كل شحنة، بوسطة بترنّ على كل تغيير في
// كل شحنة. وكل رنّة كانت بتشغّل مزامنة **كاملة** (كل شحنات البيزنس).
// ==========================================================================

describe("مهلة المزامنة في المسار", () => {
  beforeEach(() => {
    vi.resetModules();
    sync.mockReset();
    row = { tenant_id: "t-2sec" };
    asked = null;
    tenantToken = null;
    lastRunAt = null;
    process.env.BOSTA_WEBHOOK_KEY = KEY;
  });

  async function ring() {
    return (await import("./route")).POST(
      post(URL_OK, { trackingNumber: "77778888" })
    );
  }

  it("**اتزامن من ثواني؟ مابنزامنش تاني**", async () => {
    lastRunAt = new Date(Date.now() - 5_000).toISOString();
    const res = await ring();

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: "اتزامن من شوية" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("عدّت المهلة؟ بنزامن", async () => {
    lastRunAt = new Date(Date.now() - 120_000).toISOString();
    await ring();

    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("**مافيش مزامنة اتسجّلت قبل كده؟ بنزامن** — مش بنسكت", async () => {
    lastRunAt = null;
    await ring();

    expect(sync).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  ratePercent,
  riskBadge,
  summarizeCustomerHistory,
} from "./customer-history";

describe("عدّ أوردرات العميل", () => {
  it("بيقسّمهم صح", () => {
    const h = summarizeCustomerHistory([
      "delivered",
      "delivered",
      "returned",
      "cancelled",
      "shipped",
    ]);
    expect(h.total).toBe(5);
    expect(h.delivered).toBe(2);
    expect(h.returned).toBe(1);
    expect(h.cancelled).toBe(1);
    expect(h.inProgress).toBe(1);
    expect(h.settled).toBe(4);
  });

  it("المرتجع بعد التسليم بيتحسب رجيع برضه", () => {
    // البضاعة رجعت لنا في الحالتين — الفرق إنها اتسلّمت الأول
    const h = summarizeCustomerHistory(["returned_after_delivery", "delivered"]);
    expect(h.returned).toBe(1);
    expect(h.delivered).toBe(1);
  });

  it("الحالة الفاضية بتتحسب شغّالة مش نتيجة", () => {
    const h = summarizeCustomerHistory([null, ""]);
    expect(h.inProgress).toBe(2);
    expect(h.settled).toBe(0);
  });
});

describe("النسب بتتحسب على اللي خلص بس", () => {
  it("الأوردر اللي لسه في الطريق مابيدخلش النسبة", () => {
    // اتسلّم واحد ورجع واحد، ومعاهم تلاتة لسه ماشيين
    const h = summarizeCustomerHistory([
      "delivered",
      "returned",
      "shipped",
      "new",
      "out_for_delivery",
    ]);
    expect(h.settled).toBe(2);
    expect(h.returnRate).toBe(0.5);
  });

  it("عميل كل أوردراته لسه شغّالة: مفيش نسبة", () => {
    const h = summarizeCustomerHistory(["new", "confirmed"]);
    expect(h.returnRate).toBeNull();
    expect(h.cancelRate).toBeNull();
    // **مهم**: مش "نسبة تسليمه صفر" — ده عميل لسه مالوش تاريخ
    expect(h.risk).toBe("new");
  });

  it("عميل جديد خالص", () => {
    const h = summarizeCustomerHistory([]);
    expect(h.total).toBe(0);
    expect(h.risk).toBe("new");
    expect(h.returnRate).toBeNull();
  });
});

describe("التصنيف", () => {
  it("بيرجّع كتير: نص أوردراته أو أكتر رجعت", () => {
    const h = summarizeCustomerHistory(["returned", "returned", "delivered"]);
    expect(h.returnRate).toBeCloseTo(2 / 3, 5);
    expect(h.risk).toBe("bad");
  });

  it("خد بالك: من الربع للنص", () => {
    const h = summarizeCustomerHistory([
      "returned",
      "delivered",
      "delivered",
      "delivered",
    ]);
    expect(h.returnRate).toBe(0.25);
    expect(h.risk).toBe("watch");
  });

  it("منتظم: أقل من الربع", () => {
    const h = summarizeCustomerHistory([
      "returned",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
    ]);
    expect(h.returnRate).toBe(0.2);
    expect(h.risk).toBe("good");
  });

  it("أوردر واحد رجع مايبقاش حكم على العميل", () => {
    // **دي مقصودة**: عميل عنده أوردر واحد بس ورجع، نسبته ١٠٠٪ —
    // بس ده مش تاريخ، ده صدفة. مانتهمش حد من أوردر واحد.
    const h = summarizeCustomerHistory(["returned"]);
    expect(h.returnRate).toBe(1);
    expect(h.risk).toBe("new");
  });

  it("اتنين خلصوا بقى ينفع نحكم", () => {
    const h = summarizeCustomerHistory(["returned", "returned"]);
    expect(h.risk).toBe("bad");
  });

  it("الإلغاء لوحده مابيخليش العميل خطر", () => {
    // الإلغاء قبل الشحن مابيكلّفش رسوم — الرجيع هو اللي بيكلّف
    const h = summarizeCustomerHistory(["cancelled", "cancelled", "delivered"]);
    expect(h.risk).toBe("good");
    expect(h.cancelRate).toBeCloseTo(2 / 3, 5);
  });
});

describe("العرض", () => {
  it("الشارة بتتغير مع التصنيف", () => {
    expect(riskBadge("bad").label).toBe("بيرجّع كتير");
    expect(riskBadge("watch").label).toBe("خد بالك");
    expect(riskBadge("good").label).toBe("عميل منتظم");
    expect(riskBadge("new").label).toBe("لسه مافيش تاريخ");
  });

  it("النسبة بتتقرّب لأقرب رقم صحيح", () => {
    expect(ratePercent(0.3333)).toBe("33%");
    expect(ratePercent(0.5)).toBe("50%");
    expect(ratePercent(null)).toBe("—");
  });
});

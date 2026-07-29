import { describe, expect, it } from "vitest";
import { matchCity, matchZone, normalizeAr, type BostaCity } from "./cities";

// بوسطة بترجّع ٢٨ محافظة بس — من غير مناطق. دي عيّنة بنفس الشكل بالظبط.
const cities: BostaCity[] = [
  { _id: "cairo1", nameAr: "القاهرة", name: "Cairo" },
  { _id: "giza1", nameAr: "الجيزة", name: "Giza" },
  { _id: "alex1", nameAr: "الإسكندرية", name: "Alexandria" },
  { _id: "luxor1", nameAr: "الأقصر", name: "Luxor" },
  { _id: "sinaiN", nameAr: "شمال سيناء", name: "North Sinai" },
  { _id: "sinaiS", nameAr: "جنوب سيناء", name: "South Sinai" },
];

describe("تطبيع النص", () => {
  it("بيوحّد الألف والياء والتاء المربوطة", () => {
    expect(normalizeAr("الأقصر")).toBe(normalizeAr("الاقصر"));
    expect(normalizeAr("الإسكندرية")).toBe(normalizeAr("الاسكندريه"));
    expect(normalizeAr("مصر الجديدة")).toBe(normalizeAr("مصر الجديده"));
  });

  it("بيحوّل الفواصل والرموز لمسافات", () => {
    expect(normalizeAr("القاهرة, مدينة نصر")).toBe("القاهره مدينه نصر");
  });

  it("بيستحمل الفاضي", () => {
    expect(normalizeAr(null)).toBe("");
    expect(normalizeAr(undefined)).toBe("");
  });
});

describe("مطابقة المدينة بالاسم", () => {
  it("بتلاقي المحافظة جوّه عنوان مكتوب بأي شكل", () => {
    expect(matchCity(cities, "محافظه الأقصر, مركز اسنا")?._id).toBe("luxor1");
    expect(matchCity(cities, "٥ ش الجمهورية - الجيزة")?._id).toBe("giza1");
  });

  it("بتشتغل بالإنجليزي كمان", () => {
    expect(matchCity(cities, "12 Road 9, Maadi, Cairo")?._id).toBe("cairo1");
  });

  it("بتاخد أطول اسم مطابق — عشان سيناء متتلخبطش", () => {
    expect(matchCity(cities, "العريش، شمال سيناء")?._id).toBe("sinaiN");
    expect(matchCity(cities, "شرم الشيخ، جنوب سيناء")?._id).toBe("sinaiS");
  });
});

describe("مطابقة المدينة بالمناطق المشهورة", () => {
  // دي الحالة اللي وقفت أوردر ١٣٧١ — عنوان مافيهوش اسم محافظة خالص
  it("بتحوّل التجمع الخامس للقاهرة", () => {
    expect(matchCity(cities, "التجمع الخامس، Hogcity")?._id).toBe("cairo1");
  });

  it("بتحوّل الشيخ زايد وأكتوبر للجيزة", () => {
    expect(matchCity(cities, "الشيخ زايد، الحي الثامن")?._id).toBe("giza1");
    expect(matchCity(cities, "6th of October City")?._id).toBe("giza1");
  });

  it("بتحوّل سموحة للإسكندرية", () => {
    expect(matchCity(cities, "سموحة، شارع فوزي معاذ")?._id).toBe("alex1");
  });

  it("اسم المحافظة الصريح أهم من المنطقة", () => {
    // "المعادي" في جدول المناطق بتوديه القاهرة، بس العنوان قايل الجيزة
    expect(matchCity(cities, "الجيزة - شارع المعادي")?._id).toBe("giza1");
  });
});

describe("لما المدينة مش واضحة", () => {
  it("بترجّع فاضي بدل ما تخمّن", () => {
    expect(matchCity(cities, "شارع ٩ الدور التالت شقة ٤")).toBeNull();
    expect(matchCity(cities, "")).toBeNull();
    expect(matchCity(cities, null)).toBeNull();
  });

  it("حرفين مابيطابقوش — عشان مايمسكوش أي كلمة", () => {
    expect(matchCity([{ _id: "x", nameAr: "قا" }], "قاعة أفراح")).toBeNull();
  });
});

describe("مطابقة المنطقة", () => {
  const zones = [
    { _id: "z1", nameAr: "مدينة نصر" },
    { _id: "z2", nameAr: "مصر الجديدة" },
  ];

  it("بتلاقي المنطقة جوّه العنوان", () => {
    expect(matchZone(zones, "مدينه نصر، شارع عباس العقاد")?._id).toBe("z1");
  });

  it("بترجّع فاضي لو المدينة مالهاش مناطق — وده الوضع الطبيعي مع بوسطة", () => {
    expect(matchZone(undefined, "أي عنوان")).toBeNull();
    expect(matchZone([], "أي عنوان")).toBeNull();
  });
});

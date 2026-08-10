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

// ==========================================================================
// عناوين حقيقية وقفت شحنات فعلًا — ١٠ أغسطس ٢٠٢٦
// --------------------------------------------------------------------------
// **السبب كان واحد**: بوسطة بتقبل ٢٨ محافظة بس، والعنوان الجايّ من شوبيفاي
// فيه اسم **المدينة** («طنطا») مش المحافظة («الغربية»). عمر كان بيبعتهم
// بإيده من بوسطة كل مرة.
// ==========================================================================

const allCities: BostaCity[] = [
  { _id: "cairo", nameAr: "القاهره", name: "Cairo" },
  { _id: "giza", nameAr: "الجيزه", name: "Giza" },
  { _id: "alex", nameAr: "الاسكندريه", name: "Alexandria" },
  { _id: "gharbia", nameAr: "الغربيه", name: "Gharbia" },
  { _id: "dakahlia", nameAr: "الدقهليه", name: "Dakahlia" },
  { _id: "redsea", nameAr: "البحر الاحمر", name: "Red Sea" },
  { _id: "southsinai", nameAr: "جنوب سيناء", name: "South Sinai" },
  { _id: "suez", nameAr: "السويس", name: "Suez" },
  { _id: "sharqia", nameAr: "الشرقيه", name: "Sharqia" },
  { _id: "northcoast", nameAr: "الساحل الشمالي", name: "North Coast" },
];

describe("عناوين حقيقية كانت بتوقف الشحنة", () => {
  const cases: [string, string, string][] = [
    ["أوردر ١٣٨١", "طنطا ش المتوكل مع حسان برج المقصود الدور الخامس, متوكل مع حسان, طنطا", "gharbia"],
    ["أوردر ١٤٠٩", "حي الجامعة ش عمر بن عبد العزيز ١٣ جانبي امام محل المتحدة, 5, Mansoura", "dakahlia"],
    ["أوردر ١٤٠١", "Intercontinental, building 13-G, Unit 4, Hurghada", "redsea"],
    ["أوردر ١٣٨٩", "Regents park compound, A114, 5th Settelment", "cairo"],
  ];

  for (const [name, address, expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(matchCity(allCities, address)?._id).toBe(expected);
    });
  }
});

describe("مدن مصر اللي مش أسامي محافظات", () => {
  const cases: [string, string][] = [
    ["المحلة الكبرى، برج النور", "gharbia"],
    ["ميت غمر شارع الجيش", "dakahlia"],
    ["Sharm El Sheikh, Naama Bay", "southsinai"],
    ["الزقازيق، ش سعد زغلول", "sharqia"],
    ["العين السخنة، بورتو", "suez"],
    ["سيدي عبد الرحمن، مراسي", "northcoast"],
    ["El Gouna, Abu Tig Marina", "redsea"],
  ];

  for (const [address, expected] of cases) {
    it(`«${address}» → ${expected}`, () => {
      expect(matchCity(allCities, address)?._id).toBe(expected);
    });
  }

  // **الأطول بيكسب** — «الساحل الشمالي» قبل «الساحل»
  it("«الساحل الشمالي» مابتتلغبطش مع «الساحل»", () => {
    expect(matchCity(allCities, "الساحل الشمالي سيدي كرير")?._id).toBe("northcoast");
  });

  // اسم المحافظة صريح في العنوان بيكسب على المنطقة
  it("اسم المحافظة الصريح هو المرجع", () => {
    expect(matchCity(allCities, "طنطا, الغربية")?._id).toBe("gharbia");
  });

  // **العنوان اللي مفيهوش مدينة خالص لازم يفضل يقف** — الشحنة تروح
  // لمحافظة غلط أسوأ من إنها تقف وحد يبص عليها (أوردر ١٣٦٧)
  it("العنوان اللي مالوش مدينة بيفضل واقف", () => {
    expect(matchCity(allCities, "Ahmad yehya st., 26,11,1104, 1104")).toBe(null);
  });
});

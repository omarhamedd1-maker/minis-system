import { describe, it, expect } from "vitest";
import {
  digits,
  tailMatches,
  isLocked,
  afterWrong,
  MAX_TRIES,
  LOCK_MINUTES,
} from "./phone-gate";

const PHONE = "01001234567";
const NOW = 1_000_000;

describe("بوابة آخر أرقام", () => {
  it("آخر رقمين بيعدّوا", () => {
    expect(tailMatches(PHONE, "67")).toBe(true);
    expect(tailMatches(PHONE, "٦٧")).toBe(true);
  });

  it("رقمين غلط مايعدّوش", () => {
    expect(tailMatches(PHONE, "68")).toBe(false);
  });

  it("الرقم كامل بيعدّي بأشكاله", () => {
    for (const t of ["01001234567", "+201001234567", "0100 123 4567"]) {
      expect(tailMatches(PHONE, t), t).toBe(true);
    }
  });

  it("⚠️ رقم واحد مايفتحش", () => {
    expect(tailMatches(PHONE, "7")).toBe(false);
    expect(tailMatches(PHONE, "")).toBe(false);
  });

  it("التليفون الناقص عندنا مايفتحش", () => {
    expect(tailMatches(null, "67")).toBe(false);
    expect(tailMatches("7", "67")).toBe(false);
  });

  it("بيشيل الحروف والمسافات", () => {
    expect(digits("tel: ٠١٠٠-١٢٣")).toBe("0100123");
  });
});

describe("عدّ المحاولات", () => {
  it("مفيش محاولات = مفتوح", () => {
    expect(isLocked(null, NOW)).toBe(false);
  });

  it("بيقفل بعد الحد", () => {
    let state = afterWrong(null, NOW);
    for (let i = 1; i < MAX_TRIES; i++) state = afterWrong(state, NOW);

    expect(state.wrong).toBe(MAX_TRIES);
    expect(isLocked(state, NOW)).toBe(true);
  });

  it("تحت الحد بيفضل مفتوح", () => {
    let state = afterWrong(null, NOW);
    for (let i = 2; i < MAX_TRIES; i++) state = afterWrong(state, NOW);
    expect(isLocked(state, NOW)).toBe(false);
  });

  it("القفلة بتفك بعد المدة", () => {
    let state = afterWrong(null, NOW);
    for (let i = 1; i < MAX_TRIES; i++) state = afterWrong(state, NOW);

    const later = NOW + LOCK_MINUTES * 60_000 + 1;
    expect(isLocked(state, later)).toBe(false);
  });

  it("⚠️ بعد ما القفلة تفك العدّ بيبدأ من الأول", () => {
    let state = afterWrong(null, NOW);
    for (let i = 1; i < MAX_TRIES; i++) state = afterWrong(state, NOW);

    const later = NOW + LOCK_MINUTES * 60_000 + 1;
    const next = afterWrong(state, later);
    expect(next.wrong).toBe(1);
    expect(isLocked(next, later)).toBe(false);
  });
});

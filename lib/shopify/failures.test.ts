import { describe, expect, it } from "vitest";
import {
  NOT_LINKED_ERROR,
  SHOP_CLOSED_ERROR,
  importAlertNeeded,
} from "./failures";

describe("أنهي وقوف يستاهل إشعار", () => {
  it("⚠️ المتجر المقفول مالوش إشعار — صاحبه قافله والتصليح مش عندنا", () => {
    expect(importAlertNeeded(SHOP_CLOSED_ERROR)).toBe(false);
  });

  it("⚠️ المش مربوط مالوش إشعار — وضع طبيعي لبيزنس جديد أو الديمو", () => {
    expect(importAlertNeeded(NOT_LINKED_ERROR)).toBe(false);
  });

  it("والتفصيل الزيادة على نفس السبب مابيرجّعش الإشعار", () => {
    expect(importAlertNeeded(SHOP_CLOSED_ERROR + " (Unavailable Shop)")).toBe(false);
  });

  it("المفتاح المرفوض عطل حقيقي — بيتبعت", () => {
    expect(importAlertNeeded("شوبيفاي رفضت المفتاح")).toBe(true);
  });

  it("أي وقوع تاني بيتبعت", () => {
    expect(importAlertNeeded("الجلب وقع")).toBe(true);
    expect(importAlertNeeded("شوبيفاي ردّت بكود 500")).toBe(true);
  });

  it("السبب الفاضي مابيبعتش", () => {
    expect(importAlertNeeded("")).toBe(false);
    expect(importAlertNeeded("   ")).toBe(false);
  });
});

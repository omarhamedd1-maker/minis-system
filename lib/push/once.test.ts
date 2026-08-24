import { describe, it, expect, vi } from "vitest";
import { reserveOnce, dailyTag } from "./once";

/** قاعدة بيانات وهمية بتتصرّف زي القيد الفريد */
function fakeDb(seen = new Set<string>()) {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      insert: async (row: { tenant_id: string; tag: string }) => {
        const key = `${row.tenant_id}|${row.tag}`;
        inserts.push(row);
        if (seen.has(key)) return { error: { code: "23505" } };
        seen.add(key);
        return { error: null };
      },
    }),
  };
  return { db, inserts };
}

const T = "tenant-1";

describe("التنبيه مرة واحدة", () => {
  it("أول مرة بيتبعت", async () => {
    const { db } = fakeDb();
    expect(await reserveOnce(db as never, T, "drop-2026-08-20")).toEqual({
      send: true,
    });
  });

  it("⚠️⚠️ التاني على نفس التاج مابيتبعتش", async () => {
    const { db } = fakeDb();
    await reserveOnce(db as never, T, "drop-2026-08-20");
    const again = await reserveOnce(db as never, T, "drop-2026-08-20");
    expect(again).toEqual({ send: false, reason: "already" });
  });

  it("⚠️ ٩٦ لفة في اليوم = بعتة واحدة", async () => {
    const { db } = fakeDb();
    let sent = 0;
    for (let i = 0; i < 96; i++) {
      const r = await reserveOnce(db as never, T, "drop-2026-08-20");
      if (r.send) sent++;
    }
    expect(sent).toBe(1);
  });

  it("بكرة تاج تاني — بيتبعت تاني", async () => {
    const { db } = fakeDb();
    await reserveOnce(db as never, T, "drop-2026-08-20");
    expect((await reserveOnce(db as never, T, "drop-2026-08-21")).send).toBe(true);
  });

  it("⚠️ كل بيزنس ليه حجزه — بيزنس مايمنعش تنبيه بيزنس تاني", async () => {
    const { db } = fakeDb();
    await reserveOnce(db as never, T, "drop-2026-08-20");
    expect((await reserveOnce(db as never, "tenant-2", "drop-2026-08-20")).send).toBe(
      true
    );
  });

  it("⚠️ الجدول لو مش موجود بنبعت — التنبيه اللي مايوصلش أوحش", async () => {
    const db = {
      from: () => ({
        insert: async () => ({ error: { code: "42P01", message: "no table" } }),
      }),
    };
    expect(await reserveOnce(db as never, T, "x")).toEqual({
      send: true,
      reason: "no_table",
    });
  });

  it("⚠️ والاستثناء برضه بيبعت مش بيوقّع الكرون", async () => {
    const db = {
      from: () => ({
        insert: async () => {
          throw new Error("network");
        },
      }),
    };
    await expect(reserveOnce(db as never, T, "x")).resolves.toEqual({
      send: true,
      reason: "no_table",
    });
  });

  it("⚠️ التاج اليومي بالتوقيت المصري مش العالمي", () => {
    // ١١ بالليل بتوقيت مصر = ٢٠:٠٠ عالمي — نفس اليوم المصري
    const late = new Date("2026-08-20T20:00:00Z");
    expect(dailyTag("drop", late)).toBe("drop-2026-08-20");
    // ١ بعد نص الليل بتوقيت مصر = ٢٢:٠٠ عالمي لليوم اللي فات
    const after = new Date("2026-08-20T22:00:00Z");
    expect(dailyTag("drop", after)).toBe("drop-2026-08-21");
  });
});

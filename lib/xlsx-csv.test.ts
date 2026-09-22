import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { xlsxToCsv } from "./xlsx-csv";

/**
 * ⚠️ **بنبني ملف إكسل بإيدنا في الاختبار** بدل ما نعتمد على ملف على
 * الجهاز — الاختبار لازم يشتغل في الفحص الأوتوماتيك كمان.
 *
 * الملف الحقيقي (كشف بوسطة ٢٣ سبتمبر) اتجرّب مرة واحدة يدويًا: ٩٧ تحويل
 * و٣٤٩ بند والتصالح صفر.
 */
function makeXlsx(files: { name: string; content: string }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.from(f.content, "utf8");
    const data = deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 14); // crc — مش بنتحقق منه
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += 30 + name.length + data.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, cdBuf, eocd]);
}

const sheet = (rows: string) =>
  `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe("قراية إكسل", () => {
  it("النص الجوّاني بيتقرا", () => {
    const xml = sheet(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Category</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row>` +
        `<row r="2"><c r="A2" t="inlineStr"><is><t>Cash Out</t></is></c><c r="B2"><v>-4394.36</v></c></row>`
    );
    const csv = xlsxToCsv(makeXlsx([{ name: "xl/worksheets/sheet1.xml", content: xml }]));
    expect(csv).toBe('"Category","Amount"\n"Cash Out","-4394.36"');
  });

  it("النصوص المشتركة بتتقرا كمان", () => {
    const xml = sheet(`<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>`);
    const shared = `<sst><si><t>Date</t></si><si><t>Category</t></si></sst>`;
    const csv = xlsxToCsv(
      makeXlsx([
        { name: "xl/worksheets/sheet1.xml", content: xml },
        { name: "xl/sharedStrings.xml", content: shared },
      ])
    );
    expect(csv).toBe('"Date","Category"');
  });

  it("⚠️⚠️ الخلية الفاضية بتفضل في مكانها — التزحزح بيقلب الأعمدة", () => {
    // العمود B ناقص في السطر التاني
    const xml = sheet(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c></row>` +
        `<row r="2"><c r="A2"><v>1</v></c><c r="C2"><v>3</v></c></row>`
    );
    const csv = xlsxToCsv(makeXlsx([{ name: "xl/worksheets/sheet1.xml", content: xml }]));
    expect(csv.split("\n")[1]).toBe('"1","","3"');
  });

  it("الرموز المهرّبة بترجع زي ما هي", () => {
    const xml = sheet(`<row r="1"><c r="A1" t="inlineStr"><is><t>a &amp;amp; b</t></is></c></row>`);
    const csv = xlsxToCsv(makeXlsx([{ name: "xl/worksheets/sheet1.xml", content: xml }]));
    expect(csv).toBe('"a &amp; b"');
  });

  it("ملف مش إكسل بيقول السبب", () => {
    expect(() => xlsxToCsv(Buffer.from("مش ملف إكسل"))).toThrow("مش إكسل سليم");
  });

  it("إكسل من غير ورقة بيانات بيقول السبب", () => {
    expect(() => xlsxToCsv(makeXlsx([{ name: "docProps/app.xml", content: "<x/>" }]))).toThrow(
      "مالقيناش ورقة بيانات"
    );
  });
});

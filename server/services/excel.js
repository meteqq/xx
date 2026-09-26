const ExcelJS = require('exceljs');

/** Ortak rapor yapısını .xlsx dosyasına çevirir. */
async function raporExcel(r, firma) {
  const wb = new ExcelJS.Workbook();
  wb.creator = firma || 'Cari Takip';
  const ws = wb.addWorksheet(r.baslik.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
  const n = r.kolonlar.length;

  ws.addRow([firma || '']).font = { bold: true, size: 12 };
  ws.addRow([r.baslik]).font = { bold: true, size: 14 };
  ws.addRow([r.alt || '']).font = { italic: true, color: { argb: 'FF666666' } };
  for (let i = 1; i <= 3; i++) ws.mergeCells(i, 1, i, n);
  ws.addRow([]);

  const baslik = ws.addRow(r.kolonlar.map((k) => k.label));
  baslik.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    c.alignment = { vertical: 'middle' };
  });

  const deger = (k, v) => {
    if (v === null || v === undefined) return '';
    if (k.type === 'money' || k.type === 'bakiye') return typeof v === 'number' ? v / 100 : v;
    if (k.type === 'date') return v ? new Date(v + 'T00:00:00Z') : '';
    return v;
  };
  for (const s of r.satirlar) ws.addRow(r.kolonlar.map((k) => deger(k, s[k.key])));

  if (r.toplam) {
    const t = ws.addRow(r.kolonlar.map((k, i) => (i === 0 ? 'TOPLAM' : deger(k, r.toplam[k.key]))));
    t.font = { bold: true };
    t.eachCell((c) => { c.border = { top: { style: 'thin' } }; });
  }

  r.kolonlar.forEach((k, i) => {
    const col = ws.getColumn(i + 1);
    if (k.type === 'money' || k.type === 'bakiye') col.numFmt = '#,##0.00';
    if (k.type === 'date') col.numFmt = 'dd.mm.yyyy';
    let max = k.label.length;
    col.eachCell({ includeEmpty: false }, (c, row) => {
      if (row < 5) return;
      const len = c.value instanceof Date ? 10 : String(c.value ?? '').length;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 2, 10), 60);
  });
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  return wb.xlsx.writeBuffer();
}

module.exports = { raporExcel };

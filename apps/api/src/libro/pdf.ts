function ascii(value: string) {
  return value.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, ' ');
}

export function ledgerPdf(lines: string[]): Buffer {
  const text = lines.map((line) => ascii(line)).join(') Tj T* (');
  const stream = `BT /F1 11 Tf 48 760 Td 14 TL (${text}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${offsets.length}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1))
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}

const sample = {
  controller: 'Responsable de ejemplo',
  purpose: 'Finalidad de ejemplo',
  dataCategories: 'Datos de ejemplo',
  retention: 'Plazo de ejemplo',
};

export function cleanText(value: unknown, max = 500): string {
  const str =
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sampleNotice(fields: {
  controller: string;
  purpose: string;
  dataCategories: string;
  retention: string;
}): boolean {
  return (
    fields.controller === sample.controller ||
    fields.purpose === sample.purpose ||
    fields.dataCategories === sample.dataCategories ||
    fields.retention === sample.retention
  );
}

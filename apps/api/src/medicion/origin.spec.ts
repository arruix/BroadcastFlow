import { reportOrigin, visitOrigin } from './origin';

describe('reportOrigin', () => {
  it('muestra WhatsApp cuando la base guardó other con utm_source whatsapp', () => {
    expect(visitOrigin('whatsapp', undefined)).toBe('other');
    expect(reportOrigin('other', 'WhatsApp')).toBe('whatsapp');
    expect(reportOrigin('other', 'wa')).toBe('whatsapp');
    expect(reportOrigin('other', 'tg')).toBe('telegram');
  });

  it('no cambia redes conocidas ni otras fuentes', () => {
    expect(reportOrigin('facebook', 'whatsapp')).toBe('facebook');
    expect(reportOrigin('other', 'newsletter')).toBe('other');
    expect(reportOrigin('other', null)).toBe('other');
  });
});

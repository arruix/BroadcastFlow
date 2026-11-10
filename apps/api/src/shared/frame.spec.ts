import {
  clampFrame,
  defaultFrame,
  heroDefault,
  httpsImage,
  panFrame,
  placements,
} from './frame';

describe('encuadre', () => {
  it('recorta valores fuera de rango y rechaza los que no son números', () => {
    expect(clampFrame({ x: 140, y: -4, zoom: 9 })).toEqual({
      x: 100,
      y: 0,
      zoom: 3,
    });
    expect(clampFrame({ x: 10, y: 20, zoom: 0.2 })).toEqual({
      x: 10,
      y: 20,
      zoom: 1,
    });
    expect(clampFrame({ x: 'no', y: 10, zoom: 1 })).toBeNull();
  });

  it('cada red tiene un encuadre inicial y el de paisaje sube el foco', () => {
    expect(placements).toHaveLength(8);
    expect(defaultFrame('x')).toEqual({ x: 50, y: 28, zoom: 1 });
    expect(defaultFrame('facebook').y).toBeLessThan(50);
    expect(defaultFrame('instagram-feed')).toEqual({ x: 50, y: 42, zoom: 1 });
    expect(defaultFrame('instagram-story').y).toBe(50);
    expect(heroDefault).toEqual({ x: 50, y: 35, zoom: 1 });
  });

  it('arrastrar a la derecha baja el foco horizontal', () => {
    const next = panFrame({ x: 50, y: 30, zoom: 1 }, 40, 0, 200, 100);
    expect(next).toEqual({ x: 30, y: 30, zoom: 1 });
  });

  it('con zoom el mismo arrastre mueve menos el foco', () => {
    const next = panFrame({ x: 50, y: 50, zoom: 2 }, 0, 50, 100, 100);
    expect(next.y).toBe(25);
  });

  it('solo acepta una imagen https sin espacios', () => {
    expect(httpsImage(' https://cdn.example/a.jpg ')).toBe(
      'https://cdn.example/a.jpg',
    );
    expect(httpsImage('')).toBeNull();
    expect(httpsImage(null)).toBeNull();
    expect(httpsImage('http://cdn.example/a.jpg')).toBeUndefined();
    expect(httpsImage('https://cdn.example/a b.jpg')).toBeUndefined();
  });
});

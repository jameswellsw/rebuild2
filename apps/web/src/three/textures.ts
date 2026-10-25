import * as THREE from 'three';

function canvas2d(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  return ctx;
}

export interface TextTextureOptions {
  background?: string;
  color?: string;
  accent?: string;
  font?: string;
  sub?: string;
  subColor?: string;
  border?: boolean;
  width?: number;
  height?: number;
}

export function makeTextTexture(text: string, options: TextTextureOptions = {}): THREE.CanvasTexture {
  const width = options.width ?? 512;
  const height = options.height ?? 256;
  const ctx = canvas2d(width, height);
  ctx.fillStyle = options.background ?? '#10151f';
  ctx.fillRect(0, 0, width, height);
  if (options.border) {
    ctx.strokeStyle = options.accent ?? '#3a4658';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }
  ctx.fillStyle = options.color ?? '#f4f7fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = options.font ?? `800 ${Math.floor(height * 0.42)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.font = font;
  const lines = text.split('\n');
  const lineHeight = height / (lines.length + (options.sub ? 1.5 : 0.7));
  lines.forEach((line, i) => {
    const y = height / 2 + (i - (lines.length - 1) / 2) * lineHeight * 0.82;
    ctx.fillText(line.slice(0, 28), width / 2, y);
  });
  if (options.sub) {
    ctx.font = `600 ${Math.floor(height * 0.11)}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = options.subColor ?? options.accent ?? '#ffcf3f';
    ctx.fillText(options.sub.slice(0, 46), width / 2, height * 0.82);
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeNumberTexture(number: number, background: string, color: string): THREE.CanvasTexture {
  const ctx = canvas2d(256, 128);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  for (let i = 0; i < 256; i += 16) ctx.fillRect(i, 0, 2, 128);
  ctx.strokeStyle = 'rgba(0,0,0,.28)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 122);
  ctx.fillStyle = color;
  ctx.font = '800 78px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 128, 64);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeCarpetTexture(palette: 'dark' | 'light' = 'dark'): THREE.CanvasTexture {
  const size = 512;
  const light = palette === 'light';
  const ctx = canvas2d(size, size);
  // Dark carpet keeps the white field paint and the alliance colour readable;
  // a pale weave under bright staging lights washed the whole floor out.
  ctx.fillStyle = light ? '#4d5359' : '#2b2e33';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 12000; i++) {
    const shade = light ? 66 + Math.random() * 44 : 34 + Math.random() * 24;
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},${0.15 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.2, 1.2);
  }
  ctx.strokeStyle = light ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)';
  for (let i = 0; i < size; i += 32) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(light ? 10 : 6, light ? 5 : 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Worn concrete venue floor the carpet is laid on. */
export function makeVenueFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const ctx = canvas2d(size, size);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#767b81');
  gradient.addColorStop(0.5, '#6c7178');
  gradient.addColorStop(1, '#61666d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 22000; i++) {
    const shade = 58 + Math.random() * 58;
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 6},${0.04 + Math.random() * 0.16})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2.4, 2.4);
  }
  // Slab seams every quarter of the texture.
  ctx.strokeStyle = 'rgba(40,46,54,.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 256) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Transparent midfield decal painted straight onto the carpet. */
export function makeCenterDecal(): THREE.CanvasTexture {
  const size = 512;
  const ctx = canvas2d(size, size);
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  // Solid disc under the lettering so the logo reads on a dark carpet.
  ctx.fillStyle = 'rgba(9,14,21,.82)';
  ctx.beginPath();
  ctx.arc(c, c, 238, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(c, c, 232, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,210,63,.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, 208, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7fbff';
  ctx.font = '800 96px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText('REBUILT', c, c - 30);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '700 60px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillText('2026', c, c + 54);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function makeGridTexture(): THREE.CanvasTexture {
  const size = 512;
  const ctx = canvas2d(size, size);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#0b0f16');
  gradient.addColorStop(1, '#111925');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(88, 120, 160, .13)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeHubSign(alliance: 'red' | 'blue'): THREE.CanvasTexture {
  return makeTextTexture('FUEL', {
    width: 512,
    height: 256,
    background: alliance === 'red' ? '#8d1125' : '#003d86',
    color: '#ffffff',
    accent: alliance === 'red' ? '#ff6675' : '#5ea2ff',
    sub: 'SCORING HUB',
    border: true,
  });
}

export function makeAllianceWallTexture(alliance: 'red' | 'blue', teamNumbers: number[]): THREE.CanvasTexture {
  const ctx = canvas2d(1024, 512);
  const red = alliance === 'red';
  const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
  gradient.addColorStop(0, red ? '#4f0715' : '#001d46');
  gradient.addColorStop(0.5, red ? '#b30f2c' : '#0057b8');
  gradient.addColorStop(1, red ? '#5e0919' : '#002c62');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 5;
  ctx.strokeRect(18, 18, 988, 476);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 1024; i += 36) ctx.fillRect(i, 0, 2, 512);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 150px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(alliance === 'red' ? 'REBUILT' : 'REBUILT', 512, 190);
  ctx.font = '700 92px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillStyle = red ? '#ffd9a0' : '#bfe0ff';
  ctx.fillText(`${alliance.toUpperCase()} ALLIANCE`, 512, 312);
  ctx.font = '600 64px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  const teams = teamNumbers.length ? teamNumbers.map((n) => `#${n}`).join('   ') : '#—';
  ctx.fillText(teams.slice(0, 40), 512, 410);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

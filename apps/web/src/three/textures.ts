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
  // Neyland II 20 "Medallion": a neutral mid grey loop pile with a fine
  // salt-and-pepper speckle. Close enough to the real carpet to read as grey
  // on camera without swallowing the 2 in gaffer tape or the black HDPE.
  const base = light ? '#4a4e54' : '#282c31';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Loop pile: dense light/dark speckle. No large-scale mottle, because any
  // low-frequency feature repeats into a visible checker across a 28 m field.
  for (let i = 0; i < 32000; i++) {
    const shade = light ? 74 + Math.random() * 40 : 38 + Math.random() * 24;
    ctx.fillStyle = `rgba(${shade},${shade + 1},${shade + 4},${0.25 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.2);
  }
  // Faint pile direction, kept low contrast so it never bands.
  ctx.strokeStyle = light ? 'rgba(255,255,255,.022)' : 'rgba(255,255,255,.012)';
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i + 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(light ? 24 : 12, light ? 12 : 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Greyscale pile relief for the carpet, used as a bump map. */
export function makeCarpetBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const shade = 96 + Math.random() * 64;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.3 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 1.4);
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 30);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/**
 * The BUMP ramps are 1/2 in HDPE with an "Orange Peel" texture (§5.5): a
 * pebbled, matte moulded surface rather than smooth plastic.
 */
export function makeHdpeBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const radius = 1.2 + Math.random() * 2.6;
    const shade = 150 + Math.random() * 60;
    const gradient = ctx.createRadialGradient(
      Math.random() * size,
      Math.random() * size,
      0,
      Math.random() * size,
      Math.random() * size,
      radius,
    );
    gradient.addColorStop(0, `rgba(${shade},${shade},${shade},.85)`);
    gradient.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Worn concrete venue floor the carpet is laid on. */
export function makeVenueFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const ctx = canvas2d(size, size);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#4d5258');
  gradient.addColorStop(0.5, '#464b51');
  gradient.addColorStop(1, '#3f444a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 22000; i++) {
    const shade = 40 + Math.random() * 46;
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 6},${0.04 + Math.random() * 0.14})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2.4, 2.4);
  }
  // Slab seams every quarter of the texture.
  ctx.strokeStyle = 'rgba(30,35,42,.35)';
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

/**
 * 36h11 AprilTag panel. The field carries 32 of these on the HUBs, TOWER
 * walls, OUTPOSTs and TRENCHes; a deterministic cell pattern keeps every tag
 * distinct without shipping the official images.
 */
export function makeAprilTagTexture(id: number): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(10, 10, size - 20, size - 20);
  // White quiet zone, then a 6 x 6 data grid inside a black border.
  const margin = 26;
  const cell = (size - margin * 2) / 8;
  let seed = (id * 2654435761) >>> 0;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const border = row === 0 || col === 0 || row === 7 || col === 7;
      const white = border ? true : next() > 0.48;
      ctx.fillStyle = white ? '#f4f4f0' : '#0b0b0b';
      ctx.fillRect(margin + col * cell + 0.6, margin + row * cell + 0.6, cell - 1.2, cell - 1.2);
    }
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Black netting behind the HUB opening. */
export function makeNetTexture(): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(214,222,232,.42)';
  ctx.lineWidth = 1.6;
  for (let i = -size; i < size * 2; i += 34) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Diamond-plate aluminium used on driver station bases and field carts. */
export function makeDiamondPlateTexture(): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.fillStyle = '#9aa2ab';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const shade = 128 + Math.random() * 44;
    ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 7},${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(226,232,238,.5)';
  ctx.strokeStyle = 'rgba(70,78,88,.55)';
  ctx.lineWidth = 1.5;
  for (let y = 8; y < size; y += 22) {
    for (let x = 8; x < size; x += 44) {
      const ox = (y / 22) % 2 === 0 ? 0 : 22;
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.rotate(-0.68);
      ctx.fillRect(-8, -2.6, 16, 5.2);
      ctx.strokeRect(-8, -2.6, 16, 5.2);
      ctx.restore();
    }
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

/**
 * Official FUEL: a 5.91 in yellow high-density foam ball carrying the FIRST and
 * AndyMark marks. A faint logo band is enough for the ball to read as FUEL
 * rather than a plain sphere at broadcast distance.
 */
export function makeFuelTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const ctx = canvas2d(width, height);
  // AndyMark's official FUEL is a saturated yellow high-density foam ball.
  // Keep the base deep, because warm arena light washes yellow out fast.
  ctx.fillStyle = '#eeb017';
  ctx.fillRect(0, 0, width, height);
  // Foam texture: pinprick dimples all over the surface. Kept low contrast so
  // the ball never reads as cream from a distance.
  for (let i = 0; i < 5200; i++) {
    const light = Math.random() > 0.45;
    const shade = 205 + Math.random() * 45;
    ctx.fillStyle = light
      ? `rgba(${shade},${Math.round(shade * 0.82)},40,${0.03 + Math.random() * 0.05})`
      : `rgba(120,80,8,${0.03 + Math.random() * 0.06})`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 0.7 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Equatorial logo band, printed twice so it wraps the ball.
  for (const cx of [width * 0.25, width * 0.75]) {
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.beginPath();
    ctx.ellipse(cx, height * 0.5, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.font = '800 20px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIRST', cx, height * 0.5 - 1);
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Soft contact shadow, used to bed robots and props into the carpet. */
export function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const ctx = canvas2d(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,.62)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,.34)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Wear layer for the carpet: the roll seam, gaffer-taped repairs and rubber
 * scuffs. Drawn in field metres so a repair patch stays the size of a real
 * patch, and kept translucent so the pile texture still reads underneath.
 */
export function makeCarpetWearTexture(lengthM: number, widthM: number): THREE.CanvasTexture {
  const width = 2048;
  const height = Math.max(256, Math.round(width * (widthM / Math.max(0.01, lengthM))));
  const ctx = canvas2d(width, height);
  const pxX = width / Math.max(0.01, lengthM);
  const pxZ = height / Math.max(0.01, widthM);
  // Deterministic scatter: the same field looks the same on every load, and a
  // hot reload does not reshuffle every patch.
  let seed = 20260110;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // The carpet is laid in rolls joined across the middle of the width and
  // taped down with 2 in gaff tape (§5.2). A darker join under a lighter tape
  // band is what makes the seam read from the broadcast camera.
  ctx.fillStyle = 'rgba(18,20,23,.5)';
  ctx.fillRect(0, height / 2 - pxZ * 0.045, width, pxZ * 0.09);
  ctx.fillStyle = 'rgba(126,130,136,.4)';
  ctx.fillRect(0, height / 2 - pxZ * 0.0255, width, pxZ * 0.051);
  ctx.fillStyle = 'rgba(60,64,70,.35)';
  ctx.fillRect(0, height / 2 - pxZ * 0.0255, width, pxZ * 0.008);
  ctx.fillRect(0, height / 2 + pxZ * 0.0175, width, pxZ * 0.008);

  // Repair patches: tears are taped with the same gaffer tape and robots have
  // to drive on the result (§5.2), so a handful of square-ish repairs is
  // exactly what a used carpet looks like.
  for (let i = 0; i < 10; i++) {
    const w = (0.2 + rnd() * 0.7) * pxX;
    const h = (0.14 + rnd() * 0.4) * pxZ;
    const x = rnd() * (width - w);
    const z = pxZ * 0.35 + rnd() * (height - h - pxZ * 0.7);
    const angle = (rnd() - 0.5) * 0.18;
    ctx.save();
    ctx.translate(x + w / 2, z + h / 2);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(${130 + rnd() * 24},${132 + rnd() * 24},${138 + rnd() * 24},${0.14 + rnd() * 0.14})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(34,36,40,.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    // Tape edge shadow on one side, as a hand-applied patch sits unevenly.
    ctx.fillStyle = 'rgba(20,22,25,.22)';
    ctx.fillRect(-w / 2, -h / 2, w, Math.max(1.5, pxZ * 0.012));
    ctx.restore();
  }

  // Rubber scuffs and wheel marks. They concentrate where robots actually drive:
  // the alliance zones and the approach to each HUB and BUMP.
  const hotspots = [
    [0.1, 0.5],
    [0.9, 0.5],
    [0.24, 0.28],
    [0.24, 0.72],
    [0.76, 0.28],
    [0.76, 0.72],
    [0.5, 0.5],
  ];
  for (let i = 0; i < 320; i++) {
    const spot = hotspots[Math.floor(rnd() * hotspots.length)];
    const cx = (spot[0] + (rnd() - 0.5) * 0.16) * width;
    const cz = (spot[1] + (rnd() - 0.5) * 0.22) * height;
    const len = (0.1 + rnd() * 0.55) * pxX;
    const angle = (rnd() - 0.5) * 0.9;
    ctx.save();
    ctx.translate(cx, cz);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(20,22,26,${0.03 + rnd() * 0.04})`;
    ctx.fillRect(-len / 2, -pxZ * 0.008, len, Math.max(1, pxZ * 0.016));
    ctx.restore();
  }
  // Broad, very faint traffic darkening down the middle of each alliance zone.
  for (const end of [0, 1]) {
    const x = end === 0 ? width * 0.16 : width * 0.84;
    const gradient = ctx.createRadialGradient(x, height / 2, 0, x, height / 2, width * 0.12);
    gradient.addColorStop(0, 'rgba(24,26,30,.05)');
    gradient.addColorStop(1, 'rgba(24,26,30,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - width * 0.12, height / 2 - width * 0.12, width * 0.24, width * 0.24);
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Bumper cover: 2026 bumpers are removable fabric-covered foam with the team
 * number in at least three places (§R412). The number is the loudest thing on
 * the robot, so it gets woven-in lettering rather than a floating decal.
 */
export function makeBumperTexture(
  number: number,
  alliance: 'red' | 'blue',
  teamName: string,
): THREE.CanvasTexture {
  // Wide canvas because a bumper cover wraps a roughly 27 x 4.5 in panel:
  // a square texture would stretch the number sideways.
  const width = 1024;
  const height = 160;
  const ctx = canvas2d(width, height);
  const red = alliance === 'red';
  ctx.fillStyle = red ? '#b8102b' : '#004a9e';
  ctx.fillRect(0, 0, width, height);
  // Woven cover: fine diagonal texture plus the stitched top and bottom hems.
  for (let i = 0; i < 5200; i++) {
    const shade = (red ? 150 : 90) + Math.random() * 70;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.03 + Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 1);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.lineTo(width, 7);
  ctx.moveTo(0, height - 7);
  ctx.lineTo(width, height - 7);
  ctx.stroke();
  // R401 requires white numbers at least 3.75 in tall on a 4.5 in cover, so
  // the number fills most of the panel and nothing else competes with it.
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 132px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), width / 2, height / 2 + 4);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.font = '700 18px "Inter", system-ui, sans-serif';
  ctx.fillText(teamName.toUpperCase().slice(0, 26), width - 150, height - 18);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Gridded polycarbonate side panel with a sponsor bar, as teams build them. */
export function makePolyPanelTexture(tint: string): THREE.CanvasTexture {
  const size = 256;
  const ctx = canvas2d(size, size);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.11)';
  ctx.fillRect(0, size * 0.62, size, size * 0.1);
  ctx.fillStyle = 'rgba(0,0,0,.09)';
  ctx.fillRect(0, size * 0.78, size, size * 0.06);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

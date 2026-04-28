"""Generate SideTab extension icons as simple PNGs (stdlib only)."""
import struct, zlib, os, sys

def create_png(width, height, pixels):
    """Create PNG from raw RGBA pixel data."""
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    raw = b''
    for y in range(height):
        raw += b'\x00'
        for x in range(width):
            raw += pixels[y * width + x]
    return sig + ihdr + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

# Colors
BG   = (0x1E, 0x1E, 0x2E, 0xFF)
ACC  = (0x89, 0xB4, 0xFA, 0xFF)
ACC2 = (0x45, 0x47, 0x5A, 0xFF)

def draw(size):
    pixels = []
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="16" fill="#1e1e2e"/>
      <path d="M28 24h52l12-12h28v96H28z" fill="#45475a" stroke="#89b4fa" stroke-width="3"/>
      <rect x="36" y="44" width="56" height="8" rx="3" fill="#89b4fa" opacity="0.6"/>
      <rect x="36" y="60" width="44" height="8" rx="3" fill="#89b4fa" opacity="0.4"/>
      <rect x="36" y="76" width="48" height="8" rx="3" fill="#89b4fa" opacity="0.4"/>
      <rect x="36" y="92" width="36" height="8" rx="3" fill="#89b4fa" opacity="0.3"/>
    </svg>'''

    # Simple geometric approach: tab shape
    for y in range(size):
        for x in range(size):
            # Map to 128x128 design
            dx = int(x / size * 128)
            dy = int(y / size * 128)

            # Rounded rect background
            r, g, b, a = BG

            # Tab body (simplified tab shape)
            tab_left = int(28 / 128 * size)
            tab_right = int(100 / 128 * size)
            tab_top = int(24 / 128 * size)
            tab_bot = int(120 / 128 * size)
            tab_stem_top = int(36 / 128 * size)
            stem_extra = int(12 / 128 * size)
            stem_width = int(52 / 128 * size)

            if tab_left <= x < tab_right and tab_top <= y < tab_bot:
                if x < tab_left + stem_width:
                    r, g, b, a = ACC2
                else:
                    r, g, b, a = ACC2

            # Tab highlight (top bar)
            if tab_left <= x < tab_right and tab_top <= y < tab_stem_top:
                r, g, b, a = ACC

            # Horizontal lines (bookmark lines)
            line_x0 = int(36 / 128 * size)
            line_x1 = int(92 / 128 * size)
            lines = [
                (int(44 / 128 * size), int(52 / 128 * size), 0.6),
                (int(60 / 128 * size), int(68 / 128 * size), 0.4),
                (int(76 / 128 * size), int(84 / 128 * size), 0.4),
                (int(92 / 128 * size), int(100 / 128 * size), 0.3),
            ]
            for ly0, ly1, alpha in lines:
                if line_x0 <= x < line_x1 and ly0 <= y < ly1:
                    r = int(ACC[0] * alpha + BG[0] * (1 - alpha))
                    g = int(ACC[1] * alpha + BG[1] * (1 - alpha))
                    b = int(ACC[2] * alpha + BG[2] * (1 - alpha))
                    a = 0xFF

            # Tab stem extension
            if tab_left - stem_extra <= x < tab_left + stem_extra and tab_top <= y < tab_stem_top:
                r, g, b, a = ACC

            pixels.append(bytes([r, g, b, a]))

    return pixels

output = sys.argv[1] if len(sys.argv) > 1 else 'icons'
os.makedirs(output, exist_ok=True)
for s in [16, 32, 48, 128]:
    data = create_png(s, s, draw(s))
    path = os.path.join(output, f'icon{s}.png')
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Generated {path} ({len(data)} bytes)')

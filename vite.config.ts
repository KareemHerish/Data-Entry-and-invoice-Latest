import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Color Converter from OKLCH/OKLAB to highly compatible sRGB for headless screenshot engines
function oklabToRgb(l: number, a: number, b: number, alpha: string | undefined): string {
  // LMS conversion
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l_cube = l_ * l_ * l_;
  const m_cube = m_ * m_ * m_;
  const s_cube = s_ * s_ * s_;

  // linear RGB
  const rLin = +4.0767416621 * l_cube - 3.3077115913 * m_cube + 0.2309699292 * s_cube;
  const gLin = -1.2684380046 * l_cube + 2.6097574011 * m_cube - 0.3413193965 * s_cube;
  const bLin = -0.0041960863 * l_cube - 0.7034186147 * m_cube + 1.7076147010 * s_cube;

  // Gamma correction to sRGB
  const toSRGB = (x: number) => {
    if (x <= 0.0031308) {
      return Math.max(0, Math.min(255, Math.round(12.92 * x * 255)));
    } else {
      return Math.max(0, Math.min(255, Math.round((1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255)));
    }
  };

  const r255 = toSRGB(rLin);
  const g255 = toSRGB(gLin);
  const b255 = toSRGB(bLin);

  if (alpha !== undefined && alpha !== null && alpha.trim() !== '') {
    let rawAlpha = alpha.trim();
    if (rawAlpha.endsWith('%')) {
      rawAlpha = (parseFloat(rawAlpha) / 100).toString();
    }
    return `rgba(${r255}, ${g255}, ${b255}, ${rawAlpha})`;
  }
  return `rgb(${r255}, ${g255}, ${b255})`;
}

function oklchToRgb(lStr: string, cStr: string, hStr: string, alpha: string | undefined): string {
  let l = parseFloat(lStr);
  let c = parseFloat(cStr);
  let h = parseFloat(hStr);

  if (lStr.endsWith('%')) {
    l = parseFloat(lStr) / 100;
  }
  if (isNaN(l)) l = 0;
  if (isNaN(c)) c = 0;
  if (isNaN(h)) h = 0;

  const hueRad = (h * Math.PI) / 180;
  const oklab_a = c * Math.cos(hueRad);
  const oklab_b = c * Math.sin(hueRad);

  return oklabToRgb(l, oklab_a, oklab_b, alpha);
}

function replaceColors(cssContent: string): string {
  if (!cssContent) return cssContent;

  // Process OKLCH
  let result = cssContent.replace(/oklch\s*\(\s*([^)]+)\)/gi, (match, content) => {
    try {
      const parts = content.split(/[\s,/\u00a0]+/gi).filter(Boolean);
      if (parts.length >= 3) {
        return oklchToRgb(parts[0], parts[1], parts[2], parts[3] || undefined);
      }
    } catch (err) {
      console.error('Failed to parse oklch color:', match, err);
    }
    return 'rgb(10, 88, 202)'; // fallback blue
  });

  // Process OKLAB
  result = result.replace(/oklab\s*\(\s*([^)]+)\)/gi, (match, content) => {
    try {
      const parts = content.split(/[\s,/\u00a0]+/gi).filter(Boolean);
      if (parts.length >= 3) {
        let l = parts[0];
        if (l.endsWith('%')) {
          l = (parseFloat(l) / 100).toString();
        }
        return oklabToRgb(parseFloat(l), parseFloat(parts[1]), parseFloat(parts[2]), parts[3] || undefined);
      }
    } catch (err) {
      console.error('Failed to parse oklab color:', match, err);
    }
    return 'rgb(120, 120, 120)'; // fallback grey
  });

  return result;
}

function colorSanitizerPlugin() {
  return {
    name: 'color-sanitizer',
    transform(code: string, id: string) {
      if (id.endsWith('.css') || id.includes('?vue&type=style') || id.includes('?svelte&type=style') || id.includes('type=style')) {
        return {
          code: replaceColors(code),
          map: null
        };
      }
      return null;
    },
    generateBundle(_options: any, bundle: any) {
      for (const file of Object.values(bundle) as any[]) {
        if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          file.source = replaceColors(file.source.toString());
        }
      }
    },
    transformIndexHtml(html: string) {
      return replaceColors(html);
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), colorSanitizerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

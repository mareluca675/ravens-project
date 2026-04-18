// RAVENS design tokens — single source of truth for colors, spacing, typography,
// shadows and transitions. Import `theme` from this file in every component.

const palette = {
  // Dark navy surfaces
  bg:            '#0a0e1a',
  bgElevated:    '#0f1629',
  bgCard:        'rgba(15, 22, 41, 0.7)',
  bgCardSolid:   'rgba(15, 22, 41, 0.92)',
  bgInset:       'rgba(10, 14, 26, 0.7)',
  bgInputHover:  'rgba(10, 14, 26, 0.55)',

  // Borders
  border:        'rgba(255, 255, 255, 0.06)',
  borderStrong:  'rgba(255, 255, 255, 0.12)',
  borderFocus:   'rgba(233, 69, 96, 0.5)',

  // Brand / accent
  accent:        '#e94560',
  accentDim:     '#c23152',
  accentBg:      'rgba(233, 69, 96, 0.1)',
  accentBgStrong:'rgba(233, 69, 96, 0.18)',
  accentBorder:  'rgba(233, 69, 96, 0.3)',

  // Text
  text:          '#e0e0e0',
  textMuted:     '#b5bdcc',
  textDim:       '#8892a4',
  textFaint:     '#4a5468',

  // Semantic
  success:       '#27ae60',
  successBg:     'rgba(39, 174, 96, 0.12)',
  successBorder: 'rgba(39, 174, 96, 0.35)',

  warning:       '#f39c12',
  warningBg:     'rgba(243, 156, 18, 0.12)',
  warningBorder: 'rgba(243, 156, 18, 0.35)',

  danger:        '#e74c3c',
  dangerBg:      'rgba(231, 76, 60, 0.12)',
  dangerBorder:  'rgba(231, 76, 60, 0.35)',

  info:          '#3498db',
  infoBg:        'rgba(52, 152, 219, 0.12)',
  infoBorder:    'rgba(52, 152, 219, 0.35)',
};

// Waste categories — one palette used by Map, WastePanel, LidarPipeline
// Backend returns English lowercase; display labels are Romanian.
const categoryColors = {
  plastic:      '#4A90D9',
  metal:        '#9B9B9B',
  organic:      '#7ED321',
  construction: '#F5A623',
  liquid:       '#D0021B',
  background:   '#7f8c8d',
  unknown:      '#7f8c8d',
};

const categoryLabels = {
  plastic:      'Plastic',
  metal:        'Metal',
  organic:      'Organic',
  construction: 'Construcții',
  liquid:       'Substanță lichidă',
  background:   'Fundal',
  unknown:      'Necunoscut',
};

// Dumping severity — fixed mapping to semantic colors
// HIGH = danger, MEDIUM = warning, LOW = info-ish amber
const severityColors = {
  HIGH:      palette.danger,
  MEDIUM:    palette.warning,
  LOW:       '#e6c200',
  CONFIRMED: palette.danger,    // legacy synonym for HIGH
  SUSPECTED: palette.warning,   // legacy synonym for MEDIUM
  NEGATIVE:  palette.success,
};

const severityLabels = {
  HIGH: 'RIDICATĂ', MEDIUM: 'MEDIE', LOW: 'SCĂZUTĂ',
  CONFIRMED: 'CONFIRMAT', SUSPECTED: 'SUSPECT', NEGATIVE: 'NEGATIV',
};

// Map any incoming severity/classification token to a normalized HIGH/MEDIUM/LOW.
function normalizeSeverity(token) {
  const t = String(token || '').toUpperCase();
  if (t === 'HIGH' || t === 'CONFIRMED') return 'HIGH';
  if (t === 'MEDIUM' || t === 'SUSPECTED') return 'MEDIUM';
  if (t === 'LOW' || t === 'NEGATIVE') return 'LOW';
  return 'MEDIUM';
}

const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

const radius = {
  sm: 4, md: 6, lg: 8, xl: 12, full: 999,
};

const font = {
  family: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono:   "'JetBrains Mono', 'Consolas', monospace",
  // Type scale
  caption:   '0.72rem',
  small:     '0.78rem',
  body:      '0.88rem',
  bodyLg:    '0.95rem',
  subtitle:  '1.05rem',
  title:     '1.25rem',
  h2:        '1.5rem',
  metricSm:  '1.05rem',
  metricMd:  '1.4rem',
  metricLg:  '1.85rem',
  weight:    { regular: 400, medium: 500, semibold: 600, bold: 700 },
};

const shadow = {
  sm:    '0 2px 6px rgba(0, 0, 0, 0.2)',
  md:    '0 4px 14px rgba(0, 0, 0, 0.25)',
  accent:'0 4px 14px rgba(233, 69, 96, 0.35)',
  card:  '0 4px 18px rgba(0, 0, 0, 0.3)',
};

const transition = {
  fast:   'all 0.15s ease',
  normal: 'all 0.2s ease',
  slow:   'all 0.35s ease',
};

const theme = {
  color: palette,
  categoryColors,
  categoryLabels,
  severityColors,
  severityLabels,
  normalizeSeverity,
  space,
  radius,
  font,
  shadow,
  transition,
};

export default theme;
export { palette, categoryColors, categoryLabels, severityColors, severityLabels, normalizeSeverity };

/** Hand-written SVG column chart. Flat fills, thin axis, integer ticks, no animation. */

export interface Bar {
  label: string;
  value: number;
  low: boolean;
}

export function DistChart({ bars, title, width = 268, height = 150, mono = false }: { bars: Bar[]; title: string; width?: number; height?: number; mono?: boolean }): React.JSX.Element {
  const padL = 24;
  const padB = 18;
  const padT = 8;
  const padR = 4;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const tickStep = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const top = Math.ceil(max / tickStep) * tickStep;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const bw = plotW / bars.length;
  const y = (v: number): number => padT + plotH - (v / top) * plotH;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += tickStep) ticks.push(t);
  const fill = mono ? '#777' : '#7f8c99';
  const fillLow = mono ? '#bbb' : '#c0645b';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{ display: 'block' }}>
      <title>{title}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#5b6570' : '#e3e6ea'} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={padL - 4} y={y(t) + 4} fontSize={10} textAnchor="end" fill="#5b6570">
            {t}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const x = padL + i * bw + bw * 0.15;
        const h = (b.value / top) * plotH;
        return (
          <g key={b.label}>
            {b.value > 0 && (
              <rect x={x} y={padT + plotH - h} width={bw * 0.7} height={h} fill={b.low ? fillLow : fill} shapeRendering="crispEdges">
                <title>
                  {b.label}: {b.value}
                </title>
              </rect>
            )}
            <text x={padL + i * bw + bw / 2} y={height - 5} fontSize={10} textAnchor="middle" fill="#1e2329">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

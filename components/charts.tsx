// مكونات شارتات خفيفة SVG/HTML — من غير أي مكتبات خارجية
// الألوان من لوحة محايدة متوافقة مع عمى الألوان (انظر dataviz palette)

const COLORS = {
  series1: "#2a78d6", // أزرق — المبيعات
  series2: "#1baf7a", // أخضر مائي — الأرباح
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  muted: "#898781",
  ink: "#0b0b0b",
};

const shortNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function LineChart({
  points,
  valueSuffix = "",
}: {
  points: { label: string; value: number; title?: string }[];
  valueSuffix?: string;
}) {
  const width = 720;
  const height = 220;
  const pad = { top: 20, right: 16, bottom: 28, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-400">
        مفيش بيانات في الفترة دي
      </p>
    );
  }

  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) =>
    pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / maxValue) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${pad.top + plotH} L ${x(0).toFixed(1)} ${pad.top + plotH} Z`;

  const tickCount = Math.min(6, points.length);
  const tickIndexes = Array.from({ length: tickCount }, (_, t) =>
    Math.round((t / Math.max(tickCount - 1, 1)) * (points.length - 1))
  );

  const gridLines = [0.25, 0.5, 0.75, 1];
  const maxIndex = points.reduce(
    (best, p, i) => (p.value > points[best].value ? i : best),
    0
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="شارت خطي"
    >
      {gridLines.map((g) => (
        <g key={g}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(maxValue * g)}
            y2={y(maxValue * g)}
            stroke={COLORS.grid}
            strokeWidth="1"
          />
          <text
            x={pad.left - 6}
            y={y(maxValue * g) + 3}
            textAnchor="end"
            fontSize="9"
            fill={COLORS.muted}
          >
            {shortNumber.format(maxValue * g)}
          </text>
        </g>
      ))}
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={pad.top + plotH}
        y2={pad.top + plotH}
        stroke={COLORS.baseline}
        strokeWidth="1"
      />
      <path d={areaPath} fill={COLORS.series1} opacity="0.08" />
      <path
        d={linePath}
        fill="none"
        stroke={COLORS.series1}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={points.length > 45 ? 2 : 3}
          fill={COLORS.series1}
          stroke="#ffffff"
          strokeWidth="1.5"
        >
          <title>{p.title ?? `${p.label}: ${p.value.toLocaleString("en")}${valueSuffix}`}</title>
        </circle>
      ))}
      {points[maxIndex].value > 0 && (
        <text
          x={x(maxIndex)}
          y={y(points[maxIndex].value) - 8}
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill={COLORS.ink}
        >
          {shortNumber.format(points[maxIndex].value)}
        </text>
      )}
      {tickIndexes.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 8}
          textAnchor="middle"
          fontSize="9"
          fill={COLORS.muted}
        >
          {points[i].label}
        </text>
      ))}
    </svg>
  );
}

export function GroupedBars({
  groups,
  aLabel,
  bLabel,
}: {
  groups: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
}) {
  const width = 720;
  const height = 240;
  const pad = { top: 26, right: 16, bottom: 28, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxValue = Math.max(...groups.flatMap((g) => [g.a, g.b]), 1);
  const groupW = plotW / groups.length;
  const barW = Math.min(26, groupW / 2 - 8);
  const y = (v: number) => pad.top + plotH - (v / maxValue) * plotH;
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLORS.series1 }}
          ></span>
          {aLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: COLORS.series2 }}
          ></span>
          {bLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="شارت أعمدة"
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(maxValue * g)}
              y2={y(maxValue * g)}
              stroke={COLORS.grid}
              strokeWidth="1"
            />
            <text
              x={pad.left - 6}
              y={y(maxValue * g) + 3}
              textAnchor="end"
              fontSize="9"
              fill={COLORS.muted}
            >
              {shortNumber.format(maxValue * g)}
            </text>
          </g>
        ))}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + plotH}
          y2={pad.top + plotH}
          stroke={COLORS.baseline}
          strokeWidth="1"
        />
        {groups.map((group, i) => {
          const centerX = pad.left + groupW * i + groupW / 2;
          const aX = centerX - barW - 1;
          const bX = centerX + 1;
          return (
            <g key={i}>
              <rect
                x={aX}
                y={y(group.a)}
                width={barW}
                height={Math.max(pad.top + plotH - y(group.a), group.a > 0 ? 2 : 0)}
                rx="2"
                fill={COLORS.series1}
              >
                <title>{`${group.label} — ${aLabel}: ${group.a.toLocaleString("en")}`}</title>
              </rect>
              <rect
                x={bX}
                y={y(group.b)}
                width={barW}
                height={Math.max(pad.top + plotH - y(group.b), group.b > 0 ? 2 : 0)}
                rx="2"
                fill={COLORS.series2}
              >
                <title>{`${group.label} — ${bLabel}: ${group.b.toLocaleString("en")}`}</title>
              </rect>
              {group.a > 0 && (
                <text
                  x={aX + barW / 2}
                  y={y(group.a) - 4}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill={COLORS.muted}
                >
                  {shortNumber.format(group.a)}
                </text>
              )}
              {group.b > 0 && (
                <text
                  x={bX + barW / 2}
                  y={y(group.b) - 4}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill={COLORS.muted}
                >
                  {shortNumber.format(group.b)}
                </text>
              )}
              <text
                x={centerX}
                y={height - 8}
                textAnchor="middle"
                fontSize="9.5"
                fill={COLORS.muted}
              >
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HBarList({
  items,
}: {
  items: { label: string; value: number; display: string; color?: string }[];
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        مفيش بيانات في الفترة دي
      </p>
    );
  }
  const maxValue = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-gray-700">
            {item.label}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
            <div
              className="h-full rounded"
              style={{
                width: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 2 : 0)}%`,
                backgroundColor: item.color ?? COLORS.series1,
              }}
              title={`${item.label}: ${item.display}`}
            ></div>
          </div>
          <span className="w-24 shrink-0 text-left text-sm text-gray-900" dir="ltr">
            {item.display}
          </span>
        </div>
      ))}
    </div>
  );
}

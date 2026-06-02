/**
 * -------------------------------------------------------------
 * 📊 [Health-AI-Client] 차트 드로잉 및 DOM 제어 유틸리티
 * -------------------------------------------------------------
 * 이 모듈은 건강검진 결과 시각화를 위한 SVG 차트 생성 기능과,
 * 레거시 DOM 접근을 지원하기 위한 단축 선택자 유틸리티를 제공합니다.
 * -------------------------------------------------------------
 */

// DOM 아이디 기반 요소를 빠르게 가져오는 단축 헬퍼 함수입니다.
export const $ = (id: string) => document.getElementById(id);

// CSS 선택자 기반 복수 요소를 가져오는 단축 헬퍼 함수입니다.
export const $$ = (selector: string) => document.querySelectorAll(selector);

// 연도별 건강 수치들을 가로 120, 세로 32 비율의 그라데이션 SVG 선 그래프(Sparkline)로 변환해 주는 헬퍼 함수입니다.
export function drawSparkline(
  containerId: string,
  valId: string,
  dataPoints: Array<{ year: number; value: number | null }>,
  color: string = "#f37321"
) {
  const container = $(containerId);
  const valEl = $(valId);
  if (!container) return;

  // 유효한 수치 데이터만 발라냅니다.
  const validPoints = dataPoints.filter(p => p.value !== null && !isNaN(p.value as number)) as Array<{ year: number; value: number }>;
  
  if (validPoints.length === 0) {
    container.innerHTML = `<span class="text-[10px] text-slate-300 font-semibold m-auto">기록 없음</span>`;
    if (valEl) valEl.innerText = "-";
    return;
  }

  // 최신 연도 수치 텍스트 표시
  const sortedPoints = [...validPoints].sort((a, b) => b.year - a.year);
  if (valEl) {
    // 정밀도 1자리 소수점 표시하되 소수점 아래가 0이면 제거합니다.
    valEl.innerText = sortedPoints[0].value.toFixed(1).replace(/\.0$/, "");
  }

  // 가로(X축) 시간축을 위해 과거부터 정렬합니다.
  const chronPoints = [...validPoints].sort((a, b) => a.year - b.year);

  // [UX 개정] SVG 스케일 및 텍스트 마진 여백 재설정 (연도 및 밸류 텍스트 가독 영역 확보)
  const width = 140;
  const height = 48;
  const paddingX = 12;
  const paddingTop = 12;
  const paddingBottom = 12;

  const minVal = Math.min(...chronPoints.map(p => p.value));
  const maxVal = Math.max(...chronPoints.map(p => p.value));
  const valRange = maxVal - minVal || 1; // 단일 데이터이거나 수치에 변화가 없을 경우의 보정

  // X축 증분 간격
  const xStep = chronPoints.length > 1 ? (width - paddingX * 2) / (chronPoints.length - 1) : 0;
  
  // 포인트 좌표 및 레이블 메타 정보 매핑
  const points = chronPoints.map((p, idx) => {
    const x = paddingX + idx * xStep;
    const availableHeight = height - paddingTop - paddingBottom;
    // Y축 뒤집기 (상하 패딩 유효 구획 내 환산)
    const y = height - paddingBottom - ((p.value - minVal) / valRange) * availableHeight;
    return {
      x,
      y,
      valStr: p.value.toFixed(1).replace(/\.0$/, ""),
      yearShort: `'${String(p.year).slice(-2)}`
    };
  });

  const polylineD = points.map(p => `${p.x},${p.y}`).join(" ");

  // 그라데이션 영역 path 조립
  let areaSvg = "";
  if (points.length > 1) {
    const areaPoints = [
      `${points[0].x},${height - paddingBottom}`,
      ...points.map(p => `${p.x},${p.y}`),
      `${points[points.length - 1].x},${height - paddingBottom}`
    ].join(" ");
    areaSvg = `<polygon points="${areaPoints}" fill="url(#sparkline-grad-${containerId})" opacity="0.12" />`;
  }

  // 각 포인트별 연도와 값을 미세 수치 텍스트로 렌더링
  const labelTexts = points.map(p => {
    return `
      <text x="${p.x}" y="${p.y - 3.5}" font-size="7.5" font-weight="900" text-anchor="middle" fill="${color}" opacity="0.95">${p.valStr}</text>
      <text x="${p.x}" y="${height - 2}" font-size="6.5" font-weight="800" text-anchor="middle" fill="#94a3b8">${p.yearShort}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="w-full h-full overflow-visible" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="sparkline-grad-${containerId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${areaSvg}
      <polyline points="${polylineD}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      ${labelTexts}
      <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="2" fill="${color}" />
    </svg>
  `;
}

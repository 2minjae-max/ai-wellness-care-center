/**
 * -------------------------------------------------------------
 * 👪 [Health-AI-Client] Step 2 가족력 선택 화면 제어 모듈
 * -------------------------------------------------------------
 * 부모님의 고혈압, 당뇨병 등 만성질환이나 유전 성향 정보를 선택하고
 * 버튼의 활성/비활성 스타일 상태를 토글 제어합니다.
 * -------------------------------------------------------------
 */

import { $$, $ } from "../utils/chartHelper";

// main.tsx의 전역 가족력 상태값에 접근하기 위한 컨텍스트 인터페이스 정의
export interface Step2Context {
  getFatherFactors(): string[];
  setFatherFactors(factors: string[]): void;
  getMotherFactors(): string[];
  setMotherFactors(factors: string[]): void;
}

// 가족력 선택(토글) 이벤트 리스너를 바인딩하고 스타일을 토글하는 함수입니다.
export function bindFamilyFactorEvents(ctx: Step2Context) {
  $$(".family-factor-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const relation = btn.getAttribute("data-relation");
      const factor = btn.getAttribute("data-factor");
      if (!relation || !factor) return;

      if (relation === "father") {
        let fatherFactors = [...ctx.getFatherFactors()];
        if (fatherFactors.includes(factor)) {
          fatherFactors = fatherFactors.filter(f => f !== factor);
          btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
        } else {
          fatherFactors.push(factor);
          btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
        }
        ctx.setFatherFactors(fatherFactors);
      } else if (relation === "mother") {
        let motherFactors = [...ctx.getMotherFactors()];
        if (motherFactors.includes(factor)) {
          motherFactors = motherFactors.filter(f => f !== factor);
          btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
        } else {
          motherFactors.push(factor);
          btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
        }
        ctx.setMotherFactors(motherFactors);
      }
    });
  });
}

// 가족력 데이터를 비우고 모든 가족력 버튼의 UI를 선택 해제(비활성) 상태로 초기화합니다.
export function resetFamilyFactors(ctx: Step2Context) {
  ctx.setFatherFactors([]);
  ctx.setMotherFactors([]);
  $$(".family-factor-btn").forEach((btn) => {
    btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
    btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
  });
}

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
        if (factor === "없음") {
          // '없음' 클릭 시: '없음'만 남기고 타 팩터 모두 초기화
          fatherFactors = ["없음"];
          $$(".family-factor-btn[data-relation='father']").forEach(b => {
            const f = b.getAttribute("data-factor");
            if (f === "없음") {
              b.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              b.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            } else {
              b.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
              b.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            }
          });
          ctx.setFatherFactors(fatherFactors);
        } else {
          // 타 질병 클릭 시: '없음' 해제
          fatherFactors = fatherFactors.filter(f => f !== "없음");
          const noneBtn = document.querySelector(".family-factor-btn[data-relation='father'][data-factor='없음']");
          if (noneBtn) {
            noneBtn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            noneBtn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }

          if (fatherFactors.includes(factor)) {
            fatherFactors = fatherFactors.filter(f => f !== factor);
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          } else {
            fatherFactors.push(factor);
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          }

          // 아무것도 선택 안된 경우 '없음' 강제 복원
          if (fatherFactors.length === 0) {
            fatherFactors = ["없음"];
            if (noneBtn) {
              noneBtn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              noneBtn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            }
          }
          ctx.setFatherFactors(fatherFactors);
        }
      } else if (relation === "mother") {
        let motherFactors = [...ctx.getMotherFactors()];
        if (factor === "없음") {
          // '없음' 클릭 시: '없음'만 남기고 타 팩터 모두 초기화
          motherFactors = ["없음"];
          $$(".family-factor-btn[data-relation='mother']").forEach(b => {
            const f = b.getAttribute("data-factor");
            if (f === "없음") {
              b.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              b.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            } else {
              b.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
              b.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            }
          });
          ctx.setMotherFactors(motherFactors);
        } else {
          // 타 질병 클릭 시: '없음' 해제
          motherFactors = motherFactors.filter(f => f !== "없음");
          const noneBtn = document.querySelector(".family-factor-btn[data-relation='mother'][data-factor='없음']");
          if (noneBtn) {
            noneBtn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            noneBtn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }

          if (motherFactors.includes(factor)) {
            motherFactors = motherFactors.filter(f => f !== factor);
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          } else {
            motherFactors.push(factor);
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          }

          // 아무것도 선택 안된 경우 '없음' 강제 복원
          if (motherFactors.length === 0) {
            motherFactors = ["없음"];
            if (noneBtn) {
              noneBtn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
              noneBtn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            }
          }
          ctx.setMotherFactors(motherFactors);
        }
      }
    });
  });
}

// 가족력 데이터를 비우고 모든 가족력 버튼의 UI를 선택 해제(비활성) 상태로 초기화합니다.
export function resetFamilyFactors(ctx: Step2Context) {
  ctx.setFatherFactors(["없음"]);
  ctx.setMotherFactors(["없음"]);
  $$(".family-factor-btn").forEach((btn) => {
    const fac = btn.getAttribute("data-factor");
    if (fac === "없음") {
      btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
      btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
    } else {
      btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
      btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
    }
  });
}

/**
 * -------------------------------------------------------------
 * 👤 [Health-AI-Client] Step 1 고객정보 및 프리셋 선택 화면 제어 모듈
 * -------------------------------------------------------------
 * 프리셋 인물 정보를 불러와서 화면에 카드 형태로 그리고,
 * 성별 버튼이나 프리셋 클릭 시 상호연동되는 상태값과 돔을 제어합니다.
 * -------------------------------------------------------------
 */

import { $, $$ } from "../utils/chartHelper";
import { samplePersonas } from "../data";

// main.tsx의 전역 상태 값을 직접 변경하거나 참조하지 않고,
// 인터페이스를 통해 느슨한 결합으로 제어할 수 있도록 설계된 컨텍스트 사양입니다.
export interface Step1Context {
  getUserName(): string;
  setUserName(name: string): void;
  getBirthDate(): string;
  setBirthDate(birth: string): void;
  getGender(): "M" | "F";
  setGender(gender: "M" | "F"): void;
  setNhisRecords(records: any[]): void;
  setFatherFactors(factors: string[]): void;
  setMotherFactors(factors: string[]): void;
  logAccessEvent(actionType: string, details?: any): void;
}

// 프리셋 카드를 렌더링하고 클릭 이벤트를 바인딩하는 함수입니다.
export function renderPersonaPresets(ctx: Step1Context) {
  const container = $("persona-presets-container");
  if (!container) return;

  container.innerHTML = samplePersonas.map((persona) => {
    return `
      <div class="preset-card p-3 rounded-xl border border-slate-200 hover:border-[#f37321] hover:bg-[#fff5ee] bg-white cursor-pointer transition-all flex items-center justify-between group" data-id="${persona.id}">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">${persona.icon}</span>
          <div class="text-left">
            <span class="text-xs font-extrabold text-[#231f20] group-hover:text-[#f37321] block">${persona.name} (${persona.genderText}, ${persona.age}세)</span>
            <span class="text-[10px] text-slate-400 block mt-0.5 max-w-[190px] truncate leading-tight">${persona.diseaseHint}</span>
          </div>
        </div>
        <svg class="w-3.5 h-3.5 text-slate-300 group-hover:text-[#f37321]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    `;
  }).join("");

  // 프리셋 클릭 이벤트 리스너 배정
  $$(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const personaId = card.getAttribute("data-id");
      const persona = samplePersonas.find(p => p.id === personaId);
      if (persona) {
        ctx.setUserName(persona.name);
        ctx.setBirthDate(persona.nhisData.birthDate);
        ctx.setGender(persona.nhisData.gender);
        ctx.setNhisRecords(persona.nhisData.records);

        // UI 인풋 엘리먼트 갱신
        const nameInput = $("input-username") as HTMLInputElement;
        const birthInput = $("input-birth") as HTMLInputElement;
        if (nameInput) nameInput.value = ctx.getUserName();
        if (birthInput) birthInput.value = ctx.getBirthDate();

        updateGenderButtons(ctx);
        highlightActivePreset(personaId || "");

        // 프리셋별 맞춤 가족력 자동 매핑 세팅
        let fatherFactors: string[] = [];
        let motherFactors: string[] = [];
        if (personaId === "persona-1") {
          fatherFactors = ["고혈압", "당뇨병"];
          motherFactors = ["치매"];
        } else if (personaId === "persona-2") {
          fatherFactors = ["뇌졸중/뇌혈관"];
          motherFactors = ["당뇨병", "위암/대장암"];
        } else if (personaId === "persona-3") {
          fatherFactors = ["심장질환"];
          motherFactors = ["고혈압"];
        }
        ctx.setFatherFactors(fatherFactors);
        ctx.setMotherFactors(motherFactors);

        // 가족력 버튼 UI 선택 상태 업데이트
        $$(".family-factor-btn").forEach((btn) => {
          const rel = btn.getAttribute("data-relation");
          const fac = btn.getAttribute("data-factor");
          if (!rel || !fac) return;

          const isSelected = (rel === "father" && fatherFactors.includes(fac)) || 
                             (rel === "mother" && motherFactors.includes(fac));
          if (isSelected) {
            btn.classList.remove("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
            btn.classList.add("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
          } else {
            btn.classList.remove("bg-[#ffece0]", "text-[#f37321]", "border-[#f37321]", "font-bold");
            btn.classList.add("bg-slate-50/50", "text-slate-600", "border-slate-200", "font-semibold");
          }
        });
      }
    });
  });
}

// 선택된 프리셋 카드의 테두리를 강조(하이라이트) 처리합니다.
export function highlightActivePreset(selectedId: string) {
  $$(".preset-card").forEach((card) => {
    const cardId = card.getAttribute("data-id");
    if (cardId === selectedId) {
      card.classList.add("border-[#f37321]", "bg-[#fff5ee]", "ring-1", "ring-[#f37321]");
    } else {
      card.classList.remove("border-[#f37321]", "bg-[#fff5ee]", "ring-1", "ring-[#f37321]");
    }
  });
}

// 성별 선택 버튼 상태에 대응하여 활성화 클래스를 교체합니다.
export function updateGenderButtons(ctx: Step1Context) {
  const btnM = $("btn-gender-m");
  const btnF = $("btn-gender-f");
  if (!btnM || !btnF) return;

  if (ctx.getGender() === "M") {
    btnM.classList.remove("opacity-60", "border-slate-200");
    btnM.classList.add("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
    btnF.classList.add("opacity-60", "border-slate-200");
    btnF.classList.remove("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
  } else {
    btnF.classList.remove("opacity-60", "border-slate-200");
    btnF.classList.add("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
    btnM.classList.add("opacity-60", "border-slate-200");
    btnM.classList.remove("border-[#f37321]", "text-[#f37321]", "bg-[#fff5ee]");
  }
}

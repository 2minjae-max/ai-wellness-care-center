/**
 * -------------------------------------------------------------
 * 📝 [Health-AI-Client] 폼 유효성 검증 및 입력 필드 에러 표시 헬퍼
 * -------------------------------------------------------------
 * 사용자 입력 폼의 값 검증(생년월일 형식 등)과
 * 입력 에러 시 텍스트박스가 흔들리는 애니메이션 효과 등을 처리하는 유틸입니다.
 * -------------------------------------------------------------
 */

import { $ } from "./chartHelper";

// 생년월일 (YYMMDD) 디테일 유효성 체크 함수
export function validateBirthDate(birth: string): { valid: boolean; errorMsg?: string } {
  if (!birth || birth.trim() === "") {
    return { valid: false, errorMsg: "생년월일을 입력해주세요." };
  }
  if (birth.length !== 6 || isNaN(Number(birth))) {
    return { valid: false, errorMsg: "생년월일 6자리를 정확하게 입력해주세요. (예: 840323)" };
  }

  const yearStr = birth.substring(0, 2);
  const monthStr = birth.substring(2, 4);
  const dayStr = birth.substring(4, 6);

  const yearNum = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    return { valid: false, errorMsg: `올바른 월이 아닙니다. (${monthStr}월)` };
  }

  // 가상의 세기 구분 (40년 이상이면 1900년대, 40년 미만이면 2000년대 간주)
  const fullYear = yearNum >= 40 ? 1900 + yearNum : 2000 + yearNum;
  const isLeapYear = (fullYear % 4 === 0 && fullYear % 100 !== 0) || (fullYear % 400 === 0);
  const daysInMonth = [
    31, // 1월
    isLeapYear ? 29 : 28, // 2월
    31, // 3월
    30, // 4월
    31, // 5월
    30, // 6월
    31, // 7월
    31, // 8월
    30, // 9월
    31, // 10월
    30, // 11월
    31  // 12월
  ];

  const maxDay = daysInMonth[month - 1];
  if (day < 1 || day > maxDay) {
    return { valid: false, errorMsg: `존재하지 않는 날짜입니다. (${month}월은 ${maxDay}일까지 존재합니다.)` };
  }

  return { valid: true };
}

// 에러 스타일 및 애니메이션 초기화용 헬퍼
export function clearInputErrors() {
  const nameInput = $("input-username") as HTMLInputElement | null;
  const birthInput = $("input-birth") as HTMLInputElement | null;
  const phoneInput = $("modal-input-phone") as HTMLInputElement | null;
  const nameError = $("error-username");
  const birthError = $("error-birth");
  const phoneError = $("error-modal-phone");

  if (nameInput) {
    nameInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    nameInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (birthInput) {
    birthInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    birthInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (phoneInput) {
    phoneInput.classList.remove("border-red-500", "focus:ring-red-500", "animate-shake");
    phoneInput.classList.add("border-slate-200", "focus:ring-[#f37321]");
  }
  if (nameError) {
    nameError.classList.add("hidden");
    nameError.innerText = "";
  }
  if (birthError) {
    birthError.classList.add("hidden");
    birthError.innerText = "";
  }
  if (phoneError) {
    phoneError.classList.add("hidden");
    phoneError.innerText = "";
  }
}

// 개별 필드 에러 효과 및 텍스트박스 흔들림 트리거 헬퍼
export function triggerInputError(inputEl: HTMLInputElement, errorEl: HTMLElement, message: string) {
  clearInputErrors();

  if (errorEl) {
    errorEl.innerText = message;
    errorEl.classList.remove("hidden");
  }

  if (inputEl) {
    inputEl.classList.remove("border-slate-200", "focus:ring-[#f37321]");
    inputEl.classList.add("border-red-500", "focus:ring-red-500");
    
    // 흔들기 애니메이션 트리거 (Reflow 강제)
    inputEl.classList.remove("animate-shake");
    void inputEl.offsetWidth; 
    inputEl.classList.add("animate-shake");

    inputEl.addEventListener("animationend", function handler() {
      inputEl.classList.remove("animate-shake");
      inputEl.removeEventListener("animationend", handler);
    });

    inputEl.focus();
  }
}

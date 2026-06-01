/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 단일 검진 연도의 종합 지표
export interface HealthMetrics {
  year: number;
  weight?: number;
  bmi?: number;
  waist?: number;
  systolicBP?: number;
  diastolicBP?: number;
  fastingGlucose?: number;
  hba1c?: number; // 당화혈색소
  ast?: number; // 간기능 AST
  alt?: number; // 간기능 ALT
  rGtp?: number; // 간기능 r-GTP
  creatinine?: number; // 신장 크레아티닌
  egfr?: number; // 신장 사구체여과율
  hemoglobin?: number; // 혈색소 (빈혈)
  totalCholesterol?: number;
  hdlcholesterol?: number;
  ldlcholesterol?: number;
  triglycerides?: number;
  urineProtein?: string; // 음성, 양성(+) 등
}

// 공단 건강검진 데이터 구조 (기존 히스토리)
export interface NHISData {
  userId: string;
  userName: string;
  birthDate: string;
  gender: 'M' | 'F';
  records: HealthMetrics[];
}

// PDF 추가 업로드 데이터 타입
export interface UploadedPDFReport {
  id: string;
  fileName: string;
  uploadedAt: string;
  fileSize: string;
  reportDate: string;
  institution: string;
  extractedHeadline: string;
  extractedText: string;
}

// AI 검진 결과 분석 및 가이드라인
export interface AIAnalysisResult {
  overallScore: number; // 0 - 100
  biologicalAgeDiff: number; // 실제 나이 대비 +2세, -3세 등
  summary: string;
  warnings: Array<{
    item: string; // 예: "공복 혈당"
    value: string; // 예: "112 mg/dL"
    status: 'RED' | 'YELLOW' | 'GREEN'; // 상태 컬러
    analysis: string; // AI 분석 사유
    action: string; // 즉각 대책
  }>;
  managementPlan: {
    diet: string[]; // 식단 조절 가이드
    exercise: string[]; // 추천 운동 처방
    lifestyle: string[]; // 영양제 및 생활 습관 조절
  };
  recommendedChecks: Array<{
    category: string; // 분류 (간장, 심혈관, 대사증후군 등)
    checkItem: string; // 검진 항목명 (예: "복부 초음파", "당화혈색소 정밀 검사")
    reason: string; // 추천 구체적 사유 (예: "2024년 AST/ALT의 상승 추세와 과체중을 결합 고려할 때 비알코올성 지방간 유무 확인이 필요합니다.")
    priority: 'HIGH' | 'MEDIUM'; // 중요도
  }>;
  costInfo?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
    costUsd: number;
    costKrw: number;
  };
}

// AI 챗봇 메시지 타입
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  costInfo?: {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
    costUsd: number;
    costKrw: number;
  };
}

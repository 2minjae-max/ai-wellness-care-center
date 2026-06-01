/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NHISData, UploadedPDFReport } from "./types";

// 체험을 위한 가상 NHIS 건강보험공단 검진 결과 프리셋 목록
export const samplePersonas: Array<{
  id: string;
  name: string;
  age: number;
  genderText: string;
  icon: string;
  diseaseHint: string;
  nhisData: NHISData;
}> = [
  {
    id: "persona-1",
    name: "김민우",
    age: 38,
    genderText: "남성",
    icon: "💼",
    diseaseHint: "비알코올성 간수치 경보 & 혈압 경계",
    nhisData: {
      userId: "user-1",
      userName: "김민우",
      birthDate: "880524",
      gender: "M",
      records: [
        {
          year: 2024,
          weight: 81.5,
          bmi: 26.8, // 비만
          waist: 91.2, // 남성 복부 비만 경계
          systolicBP: 134, // 고혈압 전단계
          diastolicBP: 86,
          fastingGlucose: 96,
          hba1c: 5.4,
          ast: 41, // 경미한 상승
          alt: 52, // 확연한 상승
          rGtp: 64, // 약간 상승
          creatinine: 0.95,
          egfr: 92,
          hemoglobin: 15.2,
          totalCholesterol: 218, // 경계선
          hdlcholesterol: 42,
          ldlcholesterol: 138, // 상승
          triglycerides: 190, // 상승
          urineProtein: "음성"
        },
        {
          year: 2022,
          weight: 78.2,
          bmi: 25.5,
          waist: 87.5,
          systolicBP: 126,
          diastolicBP: 80,
          fastingGlucose: 91,
          hba1c: 5.2,
          ast: 28,
          alt: 32,
          rGtp: 38,
          creatinine: 0.90,
          egfr: 96,
          hemoglobin: 15.0,
          totalCholesterol: 198,
          hdlcholesterol: 46,
          ldlcholesterol: 120,
          triglycerides: 145,
          urineProtein: "음성"
        },
        {
          year: 2020,
          weight: 74.0,
          bmi: 24.1,
          waist: 84.0,
          systolicBP: 118,
          diastolicBP: 76,
          fastingGlucose: 88,
          hba1c: 5.1,
          ast: 22,
          alt: 21,
          rGtp: 24,
          creatinine: 0.88,
          egfr: 104,
          hemoglobin: 15.1,
          totalCholesterol: 185,
          hdlcholesterol: 50,
          ldlcholesterol: 110,
          triglycerides: 115,
          urineProtein: "음성"
        },
        {
          year: 2018,
          weight: 71.8,
          bmi: 23.4,
          waist: 82.2,
          systolicBP: 114,
          diastolicBP: 74,
          fastingGlucose: 86,
          hba1c: 4.9,
          ast: 19,
          alt: 18,
          rGtp: 21,
          creatinine: 0.86,
          egfr: 106,
          hemoglobin: 15.0,
          totalCholesterol: 178,
          hdlcholesterol: 51,
          ldlcholesterol: 105,
          triglycerides: 105,
          urineProtein: "음성"
        },
        {
          year: 2016,
          weight: 70.2,
          bmi: 22.8,
          waist: 80.5,
          systolicBP: 112,
          diastolicBP: 70,
          fastingGlucose: 82,
          hba1c: 4.8,
          ast: 18,
          alt: 16,
          rGtp: 20,
          creatinine: 0.84,
          egfr: 108,
          hemoglobin: 14.8,
          totalCholesterol: 172,
          hdlcholesterol: 53,
          ldlcholesterol: 98,
          triglycerides: 95,
          urineProtein: "음성"
        }
      ]
    }
  },
  {
    id: "persona-2",
    name: "박선아",
    age: 46,
    genderText: "여성",
    icon: "🧘",
    diseaseHint: "공복 혈당 상승(당뇨 전단계) & 중성지방 경보",
    nhisData: {
      userId: "user-2",
      userName: "박선아",
      birthDate: "801103",
      gender: "F",
      records: [
        {
          year: 2024,
          weight: 64.8,
          bmi: 24.7,
          waist: 83.5,
          systolicBP: 122,
          diastolicBP: 78,
          fastingGlucose: 112, // 당뇨 전단계 위험
          hba1c: 5.8, // 경계선
          ast: 24,
          alt: 19,
          rGtp: 20,
          creatinine: 0.72,
          egfr: 98,
          hemoglobin: 11.8, // 가벼운 빈혈 양상
          totalCholesterol: 232, // 고콜레스테롤 혈증
          hdlcholesterol: 48,
          ldlcholesterol: 144, // 고중밀도 콜레스테롤
          triglycerides: 185, // 중성지방 상승
          urineProtein: "양성(+1)" // 소변 단백 검출
        },
        {
          year: 2022,
          weight: 61.2,
          bmi: 23.3,
          waist: 79.5,
          systolicBP: 118,
          diastolicBP: 74,
          fastingGlucose: 102,
          hba1c: 5.5,
          ast: 21,
          alt: 16,
          rGtp: 18,
          creatinine: 0.70,
          egfr: 102,
          hemoglobin: 12.3,
          totalCholesterol: 208,
          hdlcholesterol: 52,
          ldlcholesterol: 124,
          triglycerides: 130,
          urineProtein: "음성"
        },
        {
          year: 2020,
          weight: 58.5,
          bmi: 22.2,
          waist: 76.2,
          systolicBP: 110,
          diastolicBP: 70,
          fastingGlucose: 93,
          hba1c: 5.2,
          ast: 19,
          alt: 14,
          rGtp: 15,
          creatinine: 0.69,
          egfr: 108,
          hemoglobin: 12.8,
          totalCholesterol: 190,
          hdlcholesterol: 55,
          ldlcholesterol: 112,
          triglycerides: 110,
          urineProtein: "음성"
        },
        {
          year: 2018,
          weight: 56.5,
          bmi: 21.4,
          waist: 74.5,
          systolicBP: 108,
          diastolicBP: 68,
          fastingGlucose: 89,
          hba1c: 5.1,
          ast: 18,
          alt: 13,
          rGtp: 14,
          creatinine: 0.68,
          egfr: 109,
          hemoglobin: 12.6,
          totalCholesterol: 182,
          hdlcholesterol: 56,
          ldlcholesterol: 105,
          triglycerides: 100,
          urineProtein: "음성"
        },
        {
          year: 2016,
          weight: 55.0,
          bmi: 20.8,
          waist: 73.0,
          systolicBP: 106,
          diastolicBP: 65,
          fastingGlucose: 86,
          hba1c: 5.0,
          ast: 17,
          alt: 12,
          rGtp: 13,
          creatinine: 0.67,
          egfr: 111,
          hemoglobin: 12.5,
          totalCholesterol: 178,
          hdlcholesterol: 58,
          ldlcholesterol: 100,
          triglycerides: 90,
          urineProtein: "음성"
        }
      ]
    }
  },
  {
    id: "persona-3",
    name: "정해진",
    age: 30,
    genderText: "여성",
    icon: "🏃‍♀️",
    diseaseHint: "정상 소견 모범 건강 관리 프로필",
    nhisData: {
      userId: "user-3",
      userName: "정해진",
      birthDate: "960312",
      gender: "F",
      records: [
        {
          year: 2024,
          weight: 53.0,
          bmi: 19.9,
          waist: 68.2,
          systolicBP: 112,
          diastolicBP: 72,
          fastingGlucose: 87,
          hba1c: 4.9,
          ast: 18,
          alt: 15,
          rGtp: 12,
          creatinine: 0.65,
          egfr: 110,
          hemoglobin: 13.5,
          totalCholesterol: 172,
          hdlcholesterol: 62,
          ldlcholesterol: 88,
          triglycerides: 85,
          urineProtein: "음성"
        },
        {
          year: 2022,
          weight: 52.5,
          bmi: 19.7,
          waist: 67.8,
          systolicBP: 108,
          diastolicBP: 68,
          fastingGlucose: 84,
          hba1c: 4.8,
          ast: 16,
          alt: 13,
          rGtp: 11,
          creatinine: 0.63,
          egfr: 112,
          hemoglobin: 13.2,
          totalCholesterol: 168,
          hdlcholesterol: 60,
          ldlcholesterol: 84,
          triglycerides: 80,
          urineProtein: "음성"
        },
        {
          year: 2020,
          weight: 51.8,
          bmi: 19.5,
          waist: 67.0,
          systolicBP: 106,
          diastolicBP: 65,
          fastingGlucose: 82,
          hba1c: 4.8,
          ast: 15,
          alt: 12,
          rGtp: 10,
          creatinine: 0.64,
          egfr: 111,
          hemoglobin: 13.4,
          totalCholesterol: 165,
          hdlcholesterol: 64,
          ldlcholesterol: 81,
          triglycerides: 75,
          urineProtein: "음성"
        },
        {
          year: 2018,
          weight: 51.0,
          bmi: 19.2,
          waist: 66.5,
          systolicBP: 104,
          diastolicBP: 64,
          fastingGlucose: 80,
          hba1c: 4.7,
          ast: 14,
          alt: 11,
          rGtp: 10,
          creatinine: 0.63,
          egfr: 113,
          hemoglobin: 13.3,
          totalCholesterol: 162,
          hdlcholesterol: 65,
          ldlcholesterol: 80,
          triglycerides: 72,
          urineProtein: "음성"
        },
        {
          year: 2016,
          weight: 50.5,
          bmi: 19.0,
          waist: 66.0,
          systolicBP: 102,
          diastolicBP: 62,
          fastingGlucose: 79,
          hba1c: 4.7,
          ast: 13,
          alt: 10,
          rGtp: 9,
          creatinine: 0.62,
          egfr: 115,
          hemoglobin: 13.1,
          totalCholesterol: 160,
          hdlcholesterol: 66,
          ldlcholesterol: 78,
          triglycerides: 70,
          urineProtein: "음성"
        }
      ]
    }
  }
];

// 체험을 위한 가상 PDF 정밀 소견 결과 프리셋 목록 (기존 공단 결과에 결합하여 최고의 융합분석 제공)
export const samplePDFPresets: Array<{
  id: string;
  title: string;
  institution: string;
  headline: string;
  text: string;
}> = [
  {
    id: "pdf-1",
    title: "성정합내과 간/상복부 정밀 초음파 판독서 (2025)",
    institution: "성정합 종합내과의원",
    headline: "경도 내장지방 축적으로 비대화된 지방간(Fatty Liver) 소견",
    text: "상복부 초음파 검사 검경 결과, 간 실질의 음영 증강(bright liver)이 중등도로 관찰되어 경도 지방간(mild fatty liver) 소견에 준함. 쓸개(담낭) 내 결석이나 용종성 병변 없음. 문맥(portal vein) 확장 양상 없음. 췌장 두부 정밀 관찰은 가스 음영에 가려 일부 저하되었으나 낭성 종괴 등 관찰되지 않음. 체중 조절 식이 가료 및 아미노산 대사 모니터링 요망."
  },
  {
    id: "pdf-2",
    title: "세브 종합 메디컬 안과/심혈관 안저 정밀 검진지 (2025)",
    institution: "한국 미래세브안과의원",
    headline: "미세혈관 확장성 시신경 및 가벼운 망막 자극 흔적 검출",
    text: "망막 안저 정밀 촬영(Fundus Photography) 판독 결과, 황반부 병변은 음성이며 시신경 안저 유두 함몰비 0.3으로 정상 수치 이내임. 다만, 유두 주위 방사형 모세혈관의 미세한 구불거림(tortuosity) 및 가벼운 울혈 경향이 관찰되어 기저 혈압 조절 혹은 전신 당뇨 전단계의 초기 미세 순환 피로 소견으로 사료됨. 저염 식이 병행 및 고지혈 대사 조절 주기 관찰 요망."
  },
  {
    id: "pdf-3",
    title: "한누리 예방의학 특수 종합 혈액 추가 처방지 (2025)",
    institution: "한누리 진단수탁검사연구소",
    headline: "당화혈색소 5.9% 경고 & HDL 기능 개선 요망",
    text: "본 위탁 특수 분석 결과, 당화혈색소(HbA1c)는 5.9% (참고정상: 5.6% 이하)로 증폭되어 완연한 당뇨전단계 공복 장벽 관리를 제시함. 미세 당화 단백 검출에 기초하여 3개월 평균 포도당 누적이 위험 경계구 상단에 위치함. 혈청 인슐린 12.4 uIU/mL, HOMA-IR 인슐린 저항성 지수 2.9로 소폭 높은 상태로 식이 섬유 섭취 급선무."
  }
];

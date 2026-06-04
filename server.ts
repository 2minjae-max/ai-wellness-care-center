/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import * as codefService from "./server/services/codefService.ts";

const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// 한화손보 상품 지식 위키 (knowledge_wiki.json) 로드 유틸
// -------------------------------------------------------------
let knowledgeWiki: any = null;
function getKnowledgeWiki() {
  if (!knowledgeWiki) {
    try {
      const wikiPath = path.join(process.cwd(), "src/knowledge_wiki.json");
      if (fs.existsSync(wikiPath)) {
        knowledgeWiki = JSON.parse(fs.readFileSync(wikiPath, "utf8"));
        console.log("[Health-AI-Server] Loaded product knowledge wiki from src/knowledge_wiki.json");
      }
    } catch (e) {
      console.error("[Health-AI-Server] Failed to load knowledge wiki:", e);
    }
  }
  return knowledgeWiki;
}

// dotenv 모듈 로드
dotenv.config();

const app = express();
const PORT = 3000;

// JSON 바디 용량 상향 설정 (PDF 텍스트 및 베이스64 이미지/파일 처리를 상정)
app.use(express.json({ limit: "15mb" }));

// 슬라이트 딜레이 및 디버깅 로그 유틸
const logPrefix = "[Health-AI-Server]";

// Supabase 클라이언트 지연(lazy) 초기화 유틸
let supabaseClient: any = null;
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === "YOUR_SUPABASE_URL_HERE" || key === "YOUR_SUPABASE_ANON_KEY_HERE" || url.trim() === "" || key.trim() === "") {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(url, key);
      console.log(`${logPrefix} Supabase client successfully initialized.`);
    } catch (e) {
      console.error(`${logPrefix} Failed to initialize Supabase client:`, e);
      return null;
    }
  }
  return supabaseClient;
}

// 한국 시간(KST, UTC+9) ISO8601 문자열 생성 헬퍼
function getKstIsoString(): string {
  const tzoffset = 9 * 60 * 60 * 1000; // 9시간 밀리초
  // 데이터전송 시, UTC 환경의 DB가 시각적인 한국시간(KST)으로 직접 오차 없이 저장할 수 있도록
  // 9시간이 가산된 한국 로컬 시간을 Z 접미사와 함께 UTC 포맷으로 반환하여 시간 왜곡 문제를 방지합니다.
  return new Date(Date.now() + tzoffset).toISOString();
}

// Supabase 접속이력 로깅 범용 헬퍼 함수 (방법 B: details JSON 컬럼 내에 'model_name' 및 'model_used' 자동 적재 완료)
async function saveAccessLog(userName: string | null, birthDate: string | null, actionType: string, ipAddress: string, userAgent: string, details: any) {
  const supabase = getSupabaseClient();
  
  // 제미나이(Gemini) 호출 비용 정보 추출
  const costKrw = details && details.costKrw !== undefined ? Number(details.costKrw) : null;
  const promptTokens = details && details.promptTokens !== undefined ? Number(details.promptTokens) : null;
  const candidatesTokens = details && details.candidatesTokens !== undefined ? Number(details.candidatesTokens) : null;
  const totalTokens = details && details.totalTokens !== undefined ? Number(details.totalTokens) : null;
  const costUsd = details && details.costUsd !== undefined ? Number(details.costUsd) : null;

  // JSON details 객체 정규화 및 모델명 명시적 자가 주입 (방법 B 구현)
  let finalDetails: any = {};
  if (details) {
    if (typeof details === "string") {
      finalDetails = { info: details };
    } else {
      finalDetails = { ...details };
    }
  }

  // AI 분석 및 챗봇 관련 액션일 때 모델 정보가 누락된 경우 기본값 주입
  if (actionType.includes("ai_analysis") || actionType.includes("chatbot")) {
    const isSimulatedVal = finalDetails.isSimulated === true;
    const defaultModel = isSimulatedVal ? "clinical-rule-based-engine" : "gemini-3.1-flash-lite";
    finalDetails.model_name = finalDetails.model_name || finalDetails.model_used || finalDetails.modelUsed || defaultModel;
    finalDetails.model_used = finalDetails.model_name;
  } else {
    // 이미 존재하는 경우 key 매핑 통일화
    const mUsed = finalDetails.model_name || finalDetails.model_used || finalDetails.modelUsed;
    if (mUsed) {
      finalDetails.model_name = mUsed;
      finalDetails.model_used = mUsed;
    }
  }

  const modelValue = finalDetails.model_name || finalDetails.model_used || null;

  if (!supabase) {
    console.log(`${logPrefix} [Supabase Log Simulation] Saved event with separate columns:`, { 
      userName, 
      birthDate, 
      actionType, 
      ipAddress, 
      userAgent, 
      details: finalDetails,
      cost_krw: costKrw,
      prompt_tokens: promptTokens,
      candidates_tokens: candidatesTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      model_name: modelValue,
      model_used: modelValue
    });
    return;
  }
  try {
    // 인서트 시도: 기본 컬럼 + model_name (model_used 제외)
    const insertPayload: any = {
      user_name: userName || null,
      birth_date: birthDate || null,
      action_type: actionType,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      details: finalDetails,
      created_at: getKstIsoString(),
      cost_krw: costKrw,
      prompt_tokens: promptTokens,
      candidates_tokens: candidatesTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      model_name: modelValue
    };

    let result = await supabase
      .from("access_logs")
      .insert([insertPayload]);

    if (result.error) {
      console.warn(`${logPrefix} [Supabase Log Warning] Insert with model_name failed. Trying basic schema... Error:`, result.error.message);
      
      const fallbackPayloadBasic = {
        user_name: userName || null,
        birth_date: birthDate || null,
        action_type: actionType,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        details: finalDetails,
        created_at: getKstIsoString()
      };

      result = await supabase
        .from("access_logs")
        .insert([fallbackPayloadBasic]);
    }

    if (result.error) {
      console.error(`${logPrefix} [Supabase Log Error] Both insert attempts failed:`, result.error);
    } else {
      console.log(`${logPrefix} [Supabase Log Success] Logged action: ${actionType} with model: ${modelValue}`);
    }
  } catch (err) {
    console.error(`${logPrefix} [Supabase Log Exception]`, err);
  }
}

// Gemini API 비용 산출 헬퍼 함수 (모델별 비용 비례 자동 산출)
// gemini-3.5-flash 기준: 입력: $0.075 / 1M tokens, 출력: $0.30 / 1M tokens
// gemini-3.1-flash-lite 기준 (초경량/최적화): 입력: $0.0375 / 1M tokens, 출력: $0.15 / 1M tokens (50% 할인)
function calculateGeminiCost(usageMetadata: any, modelName: string = "gemini-3.5-flash") {
  if (!usageMetadata) {
    return {
      promptTokens: 0,
      candidatesTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costKrw: 0,
      modelUsed: modelName
    };
  }

  const promptTokens = usageMetadata.promptTokenCount || 0;
  const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
  const totalTokens = usageMetadata.totalTokenCount || (promptTokens + candidatesTokens);

  let promptCostUsd = 0;
  let candidatesCostUsd = 0;

  if (modelName === "gemini-3.1-flash-lite") {
    promptCostUsd = promptTokens * (0.0375 / 1000000);
    candidatesCostUsd = candidatesTokens * (0.15 / 1000000);
  } else {
    promptCostUsd = promptTokens * (0.075 / 1000000);
    candidatesCostUsd = candidatesTokens * (0.30 / 1000000);
  }

  const costUsd = promptCostUsd + candidatesCostUsd;
  const costKrw = Number((costUsd * 1400).toFixed(4));

  return {
    promptTokens,
    candidatesTokens,
    totalTokens,
    costUsd: Number(costUsd.toFixed(8)),
    costKrw,
    modelUsed: modelName
  };
}

// =============================================================
// [IP별 무료 호출 한도 설정]
// 동일 IP가 하루 누적 200원 이상 호출시 제한 (한화 기준)
// 이 한도 값은 향후에 언제나 쉽게 아래 변수를 통해 수정할 수 있습니다.
// =============================================================
const IP_COST_LIMIT_KRW = 200.0; 

// IP별 인메모리 누적 비용 캐시
const ipCostCache = new Map<string, number>();

/**
 * 특정 IP의 누적 비용을 계산하고 한도 초과 여부를 진단합니다.
 * DB와 인메모리를 상호 유기적으로 조율 동기화합니다.
 */
async function checkIpCostLimit(ipAddress: string): Promise<{ isBlocked: boolean; currentCost: number }> {
  if (!ipAddress) return { isBlocked: false, currentCost: 0 };

  // 1. 인메모리 캐시 값 가져오기
  let totalCost = ipCostCache.get(ipAddress) || 0;

  // 2. Supabase가 정상 설정되었으면, DB에서 action_type별 저장된 소모 costKrw의 실시간 SUM 계산
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("access_logs")
        .select("details")
        .eq("ip_address", ipAddress);

      if (!error && data) {
        let dbTotalCost = 0;
        for (const log of data) {
          if (log.details && typeof log.details === "object") {
            const cost = (log.details as any).costKrw || 0;
            dbTotalCost += Number(cost);
          }
        }
        
        // 인메모리와 동기화 중 최대치 확보
        if (dbTotalCost > totalCost) {
          totalCost = dbTotalCost;
          ipCostCache.set(ipAddress, dbTotalCost);
        }
      }
    } catch (err) {
      console.error(`${logPrefix} [IP Cost Check] DB Query Exception, using memory cache.`, err);
    }
  }

  return {
    isBlocked: totalCost >= IP_COST_LIMIT_KRW,
    currentCost: totalCost
  };
}

/**
 * 호출 완료 후 특정 IP에 사용 금액을 즉각 누적 연동합니다.
 */
function recordIpCostUsage(ipAddress: string, costKrw: number) {
  if (!ipAddress) return;
  const current = ipCostCache.get(ipAddress) || 0;
  const nextCost = Number((current + costKrw).toFixed(4));
  ipCostCache.set(ipAddress, nextCost);
  console.log(`${logPrefix} [IP Cost Check] Accrued +${costKrw} KRW to IP: ${ipAddress} (New Total: ${nextCost} KRW / Limit: ${IP_COST_LIMIT_KRW} KRW)`);
}



// Gemini API 비동기 초기화 유틸
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    console.warn(`${logPrefix} Warning: GEMINI_API_KEY is not defined or using placeholder. Running in Simulation/Demo mode.`);
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      console.log(`${logPrefix} GoogleGenAI client successfully initialized.`);
    } catch (e) {
      console.error(`${logPrefix} Failed to initialize Gemini API Client:`, e);
      return null;
    }
  }
  return aiClient;
}

// -------------------------------------------------------------
// 핑/헬스체크 API (Render 슬립 방지용)
// -------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------
// 서버 아웃바운드 IP 확인 API (CODEF 등록용 IP 체크)
// -------------------------------------------------------------
app.get("/api/check-ip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({ outboundIp: data.ip, message: "이 IP를 CODEF 대시보드에 등록해야 합니다." });
  } catch (err: any) {
    res.status(500).json({ error: "아웃바운드 IP를 확인하지 못했습니다.", details: err.message });
  }
});

// -------------------------------------------------------------
// CODEF 연동 상태 상세 정밀 진단 API (방화벽 차단/리디렉션 여부 확인용)
// -------------------------------------------------------------
app.get("/api/debug-codef", async (req, res) => {
  const client_id = process.env.CODEF_CLIENT_ID || "";
  const client_secret = process.env.CODEF_CLIENT_SECRET || "";
  const codefEnv = (process.env.CODEF_ENV || "sandbox").toLowerCase();
  
  const results: any = {
    env: codefEnv,
    hasClientId: !!client_id,
    hasClientSecret: !!client_secret,
    steps: []
  };

  // Step 1: 서버의 현재 공인 아웃바운드 IP 확인
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    results.outboundIp = ipData.ip;
    results.steps.push({ step: "1. Outbound IP Check", status: "success", ip: ipData.ip });
  } catch (err: any) {
    results.steps.push({ step: "1. Outbound IP Check", status: "failed", error: err.message });
  }

  // Step 2: CODEF OAuth 토큰 요청 시도 (리디렉션 추적 수동 제한)
  try {
    const authHeader = Buffer.from(`${client_id}:${client_secret}`).toString("base64");
    const oauthUrl = "https://oauth.codef.io/oauth/token";
    const stepData: any = { step: "2. OAuth Token Request (OAuth IP Whitelist)", url: oauthUrl };
    results.steps.push(stepData);

    const oauthRes = await fetch(oauthUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials",
      redirect: "manual" // 리디렉션 발생 시 차단된 HTML 페이지로 무한 이동해 터지는 것을 방지하고 리디렉션 정보를 캡처
    });

    stepData.status = "completed";
    stepData.httpStatus = oauthRes.status;
    stepData.headers = Object.fromEntries(oauthRes.headers.entries());
    
    const text = await oauthRes.text();
    stepData.responseBodyLength = text.length;
    stepData.responseBodySnippet = text.substring(0, 500);
  } catch (err: any) {
    results.steps[results.steps.length - 1].status = "failed";
    results.steps[results.steps.length - 1].error = err.message;
    if (err.cause) {
      results.steps[results.steps.length - 1].errorCause = err.cause.message || String(err.cause);
    }
  }

  // Step 3: CODEF API 엔드포인트 직접 호출 시도 (API IP Whitelist)
  try {
    const baseUrl = (codefEnv === "production" || codefEnv === "api")
      ? "https://api.codef.io" 
      : (codefEnv === "sandbox" ? "https://sandbox.codef.io" : "https://development.codef.io");
    const apiTestUrl = `${baseUrl}/v1/kr/public/pp/nhis-health-checkup/result`;
    const stepData: any = { step: "3. API Server Connection Check", url: apiTestUrl };
    results.steps.push(stepData);

    const apiRes = await fetch(apiTestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({}),
      redirect: "manual"
    });

    stepData.status = "completed";
    stepData.httpStatus = apiRes.status;
    stepData.headers = Object.fromEntries(apiRes.headers.entries());
    
    const text = await apiRes.text();
    stepData.responseBodyLength = text.length;
    stepData.responseBodySnippet = text.substring(0, 500);
  } catch (err: any) {
    results.steps[results.steps.length - 1].status = "failed";
    results.steps[results.steps.length - 1].error = err.message;
    if (err.cause) {
      results.steps[results.steps.length - 1].errorCause = err.cause.message || String(err.cause);
    }
  }

  if (req.query.format === "json") {
    return res.json(results);
  }

  function escapeHtml(unsafe: string) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const stepHtml = results.steps.map((s: any) => {
    // 3단계의 경우 토큰 없이 직접 샌드박스 API만 찔러본 것이므로 401 Unauthorized가 리턴되면
    // 방화벽이 차단되지 않고 정상 도달했음을 의미합니다. 이를 SUCCESS로 판정합니다.
    const isStep3 = s.step.includes("3.");
    const isSuccess = s.status === "success" || (s.status === "completed" && (s.httpStatus < 400 || (isStep3 && s.httpStatus === 401)));
    const badgeClass = isSuccess ? "badge-success" : "badge-error";
    const statusText = isSuccess ? "SUCCESS" : (s.httpStatus ? `FAILED (${s.httpStatus})` : "FAILED");
    
    let detailsHtml = "";
    if (s.error) {
      detailsHtml += `<div class="step-detail" style="border-left: 4px solid #ef4444;">
        <span style="color: #ef4444; font-weight: bold; display: block; margin-bottom: 0.25rem;">[!] 통신 에러 발생 (방화벽 차단 의심)</span>
        <strong>Message:</strong> ${escapeHtml(s.error)}
        ${s.errorCause ? `<br/><strong>Cause:</strong> ${escapeHtml(s.errorCause)}` : ""}
      </div>`;
    } else {
      let explanation = "";
      if (isStep3 && s.httpStatus === 401) {
        explanation = `<span style="color: #10b981; font-weight: bold; display: block; margin-bottom: 0.5rem;">✔ 네트워크 통신 성공: 401 Unauthorized 응답은 토큰 없이 호출했기 때문이며, 방화벽이 차단되지 않고 열려있음을 의미합니다. (IP 등록 성공)</span>`;
      } else if (isSuccess) {
        explanation = `<span style="color: #10b981; font-weight: bold; display: block; margin-bottom: 0.5rem;">✔ 통신 성공: 토큰이 정상적으로 발급되었습니다.</span>`;
      } else {
        explanation = `<span style="color: #ef4444; font-weight: bold; display: block; margin-bottom: 0.5rem;">❌ 통신 실패: CODEF API가 에러를 반환했습니다.</span>`;
      }

      detailsHtml += `<div class="step-detail" style="border-left: 4px solid ${isSuccess ? '#10b981' : '#ef4444'};">
        ${explanation}
        <strong>URL:</strong> <span class="highlight">${escapeHtml(s.url || "N/A")}</span><br/>
        <strong>HTTP Status:</strong> ${s.httpStatus || "N/A"}<br/>
        <strong>Response Snippet:</strong>
        <pre style="margin-top: 0.5rem; white-space: pre-wrap; font-family: monospace; font-size: 0.8rem; color: #cbd5e1; background-color: #020617; padding: 0.75rem; border-radius: 0.375rem;">${s.responseBodySnippet ? escapeHtml(s.responseBodySnippet) : "No Response Data"}</pre>
      </div>`;
    }

    return `
      <div class="step-card">
        <div class="step-header">
          <span class="step-title">${s.step}</span>
          <span class="badge ${badgeClass}">${statusText}</span>
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join("");

  const responseHtml = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CODEF API 연동 상태 진단 센터</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #e2e8f0;
            margin: 0;
            padding: 2rem 1rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 2rem;
        }
        h1 {
            color: #f37321;
            font-size: 1.8rem;
            font-weight: 800;
            margin: 0 0 0.5rem 0;
        }
        .subtitle {
            color: #94a3b8;
            font-size: 0.95rem;
            margin: 0;
        }
        .ip-card {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border: 2px solid #f37321;
            border-radius: 1.5rem;
            padding: 1.5rem;
            text-align: center;
            margin-bottom: 2rem;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .ip-title {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
            font-weight: 700;
        }
        .ip-value {
            font-size: 2.2rem;
            font-weight: 800;
            color: #ffffff;
            margin: 0.5rem 0;
            font-family: monospace;
            letter-spacing: -0.02em;
        }
        .ip-desc {
            font-size: 0.9rem;
            color: #cbd5e1;
            line-height: 1.5;
            margin: 0 0 1rem 0;
        }
        .btn-refresh {
            background-color: #f37321;
            color: white;
            border: none;
            padding: 0.6rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-block;
        }
        .btn-refresh:hover {
            background-color: #e06214;
            transform: translateY(-1px);
        }
        .guide-card {
            background-color: #1e293b;
            border: 1px solid #334155;
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }
        .guide-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #ffffff;
            margin: 0 0 1rem 0;
        }
        .guide-list {
            margin: 0;
            padding-left: 1.2rem;
            font-size: 0.9rem;
            color: #cbd5e1;
            line-height: 1.6;
        }
        .guide-list li {
            margin-bottom: 0.75rem;
        }
        .guide-list b {
            color: #ffffff;
        }
        .guide-list a {
            color: #38bdf8;
            text-decoration: underline;
        }
        .step-section-title {
            font-size: 1.2rem;
            font-weight: 800;
            color: #ffffff;
            margin: 0 0 1rem 0.25rem;
            border-left: 4px solid #f37321;
            padding-left: 0.5rem;
        }
        .step-card {
            background-color: #1e293b;
            border: 1px solid #334155;
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 1rem;
        }
        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        .step-title {
            font-weight: 700;
            font-size: 1rem;
            color: #ffffff;
        }
        .badge {
            font-size: 0.75rem;
            font-weight: 800;
            padding: 0.25rem 0.6rem;
            border-radius: 9999px;
            text-transform: uppercase;
        }
        .badge-success {
            background-color: #065f46;
            color: #34d399;
        }
        .badge-error {
            background-color: #7f1d1d;
            color: #f87171;
        }
        .step-detail {
            font-size: 0.85rem;
            background-color: #0f172a;
            border-radius: 0.5rem;
            padding: 1rem;
            overflow-x: auto;
            font-family: monospace;
            color: #94a3b8;
            line-height: 1.5;
        }
        .highlight {
            color: #38bdf8;
        }
        .footer-note {
            text-align: center;
            font-size: 0.8rem;
            color: #64748b;
            margin-top: 3rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚕️ 한화손보 Wellness AI: CODEF 연동 진단 센터</h1>
            <p class="subtitle">서버와 CODEF API 간의 통신 상태 및 IP 차단 여부를 정밀 분석합니다.</p>
        </div>

        <div class="ip-card">
            <div class="ip-title">현재 서버의 공인 아웃바운드 IP</div>
            <div class="ip-value">${results.outboundIp || "조회 실패"}</div>
            <p class="ip-desc">
                이 IP가 CODEF 개발자 센터의 <b>허용 IP</b>에 등록되어 있어야 실시간 국민건강보험공단 연동이 정상 작동합니다.
            </p>
            <a href="javascript:location.reload()" class="btn-refresh">🔄 상태 새로고침</a>
        </div>

        <div class="guide-card">
            <div class="guide-title">🔒 CODEF 대시보드 IP 등록 방법 가이드</div>
            <ol class="guide-list">
                <li>
                    <b>CODEF 포털 로그인</b>: 
                    <a href="https://developer.codef.io" target="_blank" rel="noopener noreferrer">CODEF 개발자 센터 (developer.codef.io)</a>에 로그인합니다.
                </li>
                <li>
                    <b>마이페이지 이동</b>: 
                    우측 상단 마이페이지 메뉴에서 <b>[API 설정]</b> 또는 대시보드의 <b>[IP 관리]</b> 메뉴로 이동합니다.
                </li>
                <li>
                    <b>허용 IP 추가</b>: 
                    허용 IP 추가 입력란에 위에 명시된 서버 IP(<b>${results.outboundIp || "확인 불가"}</b>)를 복사해서 붙여넣고 등록합니다.
                </li>
                <li>
                    <b>Render 실서버의 경우 (중요)</b>: 
                    Render 등 클라우드 배포판은 아웃바운드 IP 대역이 유동적일 수 있습니다. Render 대시보드의 서비스 내 <b>[Connect] ➔ [Outbound]</b> 탭에 명시된 모든 CIDR IP 대역들을 CODEF 대시보드에 등록해야 완벽히 작동합니다.
                </li>
                <li>
                    <b>대기 및 확인</b>: 
                    등록 완료 후 설정이 반영되는 데 <b>약 1~2분</b> 정도 소요됩니다. 반영이 완료되면 이 페이지를 새로고침하여 진단 단계가 모두 <b>SUCCESS</b>로 전환되는지 확인하십시오.
                </li>
            </ol>
        </div>

        <div class="step-section-title">📊 실시간 통신 진단 리포트</div>
        ${stepHtml}

        <div class="footer-note">
            © 2026 한화손해보험 AI Wellness Care Center. All rights reserved.
        </div>
    </div>
</body>
</html>
  `;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(responseHtml);
});

// -------------------------------------------------------------
// Supabase 접속이력 로깅 라우트
// -------------------------------------------------------------
app.post("/api/log-access", async (req, res): Promise<void> => {
  const { userName, birthDate, actionType, details } = req.body;
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";

  await saveAccessLog(userName, birthDate, actionType, ipAddress, userAgent, details);
  res.json({ status: "success" });
});

// Supabase 자가 진단 및 테스트 엔드포인트
app.get("/api/test-supabase", async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  const result: any = {
    envExists: {
      SUPABASE_URL: !!url && url !== "YOUR_SUPABASE_URL_HERE" && url.trim() !== "",
      SUPABASE_ANON_KEY: !!key && key !== "YOUR_SUPABASE_ANON_KEY_HERE" && key.trim() !== "",
    },
    urlStart: url && url.length > 8 ? url.substring(0, 15) + "..." : null,
    keyStart: key && key.length > 8 ? key.substring(0, 10) + "..." : null,
  };

  const supabase = getSupabaseClient();
  if (!supabase) {
    result.initialized = false;
    result.reason = "Supabase URL 또는 Key가 유효하지 않거나 설정되지 않았습니다.";
    res.json(result);
    return;
  }

  result.initialized = true;

  try {
    // 1. 단순 조회로 연결 확인
    const selectRes = await supabase
      .from("access_logs")
      .select("*")
      .limit(1);

    result.selectQuery = {
      error: selectRes.error,
      status: selectRes.status,
      statusText: selectRes.statusText,
      hasData: selectRes.data ? selectRes.data.length > 0 : false
    };

    // 2. 테스트 데이터 삽입 시도
    const testLog = {
      user_name: "Supabase테스트",
      birth_date: "990101",
      action_type: "supabase_test_log",
      ip_address: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1",
      user_agent: req.headers["user-agent"] || "Supabase Tester",
      details: { test: true, message: "AI Assistant 자동 자가진단 로깅 테스트", timestamp: getKstIsoString() },
      created_at: getKstIsoString()
    };

    const insertRes = await supabase
      .from("access_logs")
      .insert([testLog]);

    result.insertQuery = {
      error: insertRes.error,
      status: insertRes.status,
      statusText: insertRes.statusText
    };

    // 3. 만약 Date 타입 직렬화 오류 가능성이 있을 시, toISOString()을 활용한 2차 시도 옵션 안내용 테스트
    if (insertRes.error) {
      result.tip = "created_at 값을 new Date().toISOString()으로 포맷하여 재전송해 볼 수 있습니다.";
    }

  } catch (err: any) {
    result.exception = {
      message: err.message,
      stack: err.stack ? err.stack.split("\n")[0] : null
    };
  }

  res.json(result);
});

// -------------------------------------------------------------
// 국민건강보험공단 건강검진 API 정보 가져오기 연동 라우트
// (CODEF API 규격 기반: https://developer.codef.io/products/public/each/pp/nhis-health-check)


// -------------------------------------------------------------
// [CODEF 1차 간편인증 PUSH 발송 API]
// -------------------------------------------------------------
app.post("/api/health/nhis-sync-request", async (req, res): Promise<void> => {
  const { userName, identity, phoneNo, telecom, loginType2, bypassDummy, syncMode } = req.body;

  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";
  await saveAccessLog(userName, identity, "nhis_sync_request_start", ipAddress, userAgent, { phoneNo, telecom, loginType2 });

  try {
    const result = await codefService.requestNhisSync({
      userName,
      identity,
      phoneNo,
      telecom,
      loginType2,
      bypassDummy,
      syncMode,
      logPrefix
    });
    res.json(result);
  } catch (err: any) {
    console.error(`${logPrefix} CODEF 1차인증 예외 발생:`, err);
    if (err.cause) {
      console.error(`${logPrefix} CODEF 1차인증 예외 원인(Cause):`, err.cause);
    }
    res.status(500).json({ error: err.message, cause: err.cause?.message || String(err.cause) });
  }
});

// -------------------------------------------------------------
// [CODEF 2차 인증 완료 및 건강검진 결과 수집 API]
// -------------------------------------------------------------
app.post("/api/health/nhis-sync-confirm", async (req, res): Promise<void> => {
  const { userName, identity, phoneNo, telecom, loginType2, jti, twoWayInfo, bypassDummy, syncMode } = req.body;

  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";
  await saveAccessLog(userName, identity, "nhis_sync_confirm_start", ipAddress, userAgent, { jti });

  try {
    const result = await codefService.confirmNhisSync({
      userName,
      identity,
      phoneNo,
      telecom,
      loginType2,
      jti,
      twoWayInfo,
      bypassDummy,
      syncMode,
      logPrefix,
      body: req.body
    });
    res.json(result);
  } catch (err: any) {
    console.error(`${logPrefix} CODEF 2차인증 확인 예외 발생:`, err);
    if (err.cause) {
      console.error(`${logPrefix} CODEF 2차인증 확인 예외 원인(Cause):`, err.cause);
    }
    res.status(500).json({ error: err.message, cause: err.cause?.message || String(err.cause) });
  }
});

// -------------------------------------------------------------
// AI 처방전 / 약봉투 이미지 비전 분석 라우트 (Gemini Vision)
// -------------------------------------------------------------
app.post("/api/health/analyze-prescription", upload.single("prescriptionImage"), async (req, res): Promise<void> => {
  const file = (req as any).file;
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";

  // IP 호출 비용 실시간 한도 체크
  const limitCheck = await checkIpCostLimit(ipAddress);
  if (limitCheck.isBlocked) {
    console.log(`${logPrefix} [IP BLOCKED] Blocked prescription request from IP ${ipAddress} (Current cost: ${limitCheck.currentCost} KRW / Limit: ${IP_COST_LIMIT_KRW} KRW)`);
    res.status(429).json({
      error: `동일 IP에서 무료체험 허용 한도(${IP_COST_LIMIT_KRW}원)를 모두 소모하였습니다.`
    });
    return;
  }

  if (!file) {
    res.status(400).json({ error: "분석할 처방전/약봉투 이미지 파일이 전달되지 않았습니다." });
    return;
  }

  const ai = getGeminiClient();

  // 1. 시뮬레이션 모드 (API 키가 없거나 비활성화된 경우)
  if (!ai) {
    console.log(`${logPrefix} Running simulated prescription analysis (Gemini API disabled)...`);
    const simulatedResponse = {
      medications: [
        {
          name: "아모디핀정 5mg (Amlodipine)",
          dosage: "1일 1회, 아침 식후 30분 복용",
          efficacy: "혈압 강하제 (본태성 고혈압 치료)",
          sideEffects: "자몽 주스와 함께 복용 시 약효가 과도해질 수 있으므로 피하십시오. 복용 초기 가벼운 두통이나 어지러움이 있을 수 있습니다."
        },
        {
          name: "리피토정 10mg (Atorvastatin)",
          dosage: "1일 1회, 저녁 식후 30분 복용",
          efficacy: "이상지질혈증 치료제 (콜레스테롤 합성 저해)",
          sideEffects: "근육통, 전신 쇠약감이 갑자기 나타날 경우 의사와 상의하십시오. 자몽 주스는 피하는 것이 좋습니다."
        }
      ],
      rawTextSummary: "제출된 처방전 이미지에서 고혈압 치료제(아모디핀정) 및 고지혈증 치료제(리피토정)가 검출되었습니다. 두 약물 모두 자몽 주스와의 상호작용 위험이 있으므로 섭취를 삼가야 합니다.",
      isSimulated: true
    };

    const simulatedCost = {
      promptTokens: 2500,
      candidatesTokens: 800,
      totalTokens: 3300,
      costUsd: 0.00045,
      costKrw: 0.63
    };

    recordIpCostUsage(ipAddress, simulatedCost.costKrw);
    await saveAccessLog(null, null, "prescription_analysis_success", ipAddress, userAgent, {
      ...simulatedCost,
      fileName: file.originalname,
      isSimulated: true
    });

    res.json(simulatedResponse);
    return;
  }

  // 2. Gemini API Vision 모델 구동
  try {
    const prompt = `
이 이미지는 환자의 약 봉투 또는 처방전 사진입니다.
이미지 속 글자들을 인식하여 처방된 모든 약물의 세부 정보를 정확히 분석하고 JSON 포맷으로 응답해 주세요.

1. medications: 이미지에서 식별된 개별 약 정보의 배열
   - name: 약 이름 (제조사 및 성분명 포함)
   - dosage: 복용 방법 (일일 복용 횟수, 복용 시기, 용량 등)
   - efficacy: 주요 효능 / 치료 목적
   - sideEffects: 부작용, 식습관 주의사항 (특히 특정 음식과의 상호작용)
2. rawTextSummary: 처방 정보 전체에 대한 약사의 시선에서의 친절한 요약 및 복용 주의 권고

반드시 한글로 작성되어야 하며, 지정된 JSON 스키마를 완벽히 준수해야 합니다.
약 정보 외의 불필요한 마크업 텍스트(예: \`\`\`json) 없이 순수 JSON만 반환해 주세요.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          inlineData: {
            data: file.buffer.toString("base64"),
            mimeType: file.mimetype
          }
        },
        prompt
      ],
      config: {
        systemInstruction: "You are an expert clinical pharmacist. Output MUST exactly follow the responseSchema JSON representation. Keep descriptions active, clear, reassuring, and in Korean.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            medications: {
              type: Type.ARRAY,
              description: "처방 약물 목록",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "약 이름 및 성분명" },
                  dosage: { type: Type.STRING, description: "1일 복용법 및 시점" },
                  efficacy: { type: Type.STRING, description: "약물 효능" },
                  sideEffects: { type: Type.STRING, description: "주요 부작용 및 상호작용 주의사항" }
                },
                required: ["name", "dosage", "efficacy", "sideEffects"]
              }
            },
            rawTextSummary: { type: Type.STRING, description: "처방 정보 약사 총평 및 복용 요약" }
          },
          required: ["medications", "rawTextSummary"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");
    const costInfo = calculateGeminiCost(response.usageMetadata, "gemini-3.1-flash-lite");

    recordIpCostUsage(ipAddress, costInfo.costKrw);

    await saveAccessLog(null, null, "prescription_analysis_success", ipAddress, userAgent, {
      ...costInfo,
      fileName: file.originalname,
      isSimulated: false
    });

    res.json({
      ...parsedResult,
      isSimulated: false,
      costInfo
    });
  } catch (err: any) {
    console.error(`${logPrefix} 처방전 Vision 분석 중 장애 발생:`, err);
    res.status(500).json({ error: "처방전 이미지 분석에 실패했습니다.", detail: err.message });
  }
});

// -------------------------------------------------------------
// AI 검진 결과 융합 분석 라우트 (Schema 적용)
// -------------------------------------------------------------
app.post("/api/health/analyze", async (req, res): Promise<void> => {
  const { nhisData, uploadedPDF, familyHistory, prescriptionData } = req.body;

  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";
  const user_name = nhisData ? nhisData.userName : null;
  const birth_year = nhisData ? nhisData.birthYear : null;
  
  // IP 호출 비용 실시간 한도 체크
  const limitCheck = await checkIpCostLimit(ipAddress);
  if (limitCheck.isBlocked) {
    console.log(`${logPrefix} [IP BLOCKED] Blocked analyze request from IP ${ipAddress} (Current cost: ${limitCheck.currentCost} KRW / Limit: ${IP_COST_LIMIT_KRW} KRW)`);
    res.status(429).json({
      error: `동일 IP에서 무료체험 허용 한도(${IP_COST_LIMIT_KRW}원)를 모두 소모하였습니다. (현재 누적 금액: ${limitCheck.currentCost.toFixed(4)}원) 더 이상 실시간 분석이나 AI 상담을 호출할 수 없습니다. 관리자에게 문의해 주세요.`
    });
    return;
  }

  await saveAccessLog(user_name, birth_year, "ai_analysis_request", ipAddress, userAgent, {
    uploadedPdfName: uploadedPDF ? uploadedPDF.fileName : null,
    recordsCount: nhisData && nhisData.records ? nhisData.records.length : 0,
    hasPrescription: !!(prescriptionData && prescriptionData.medications && prescriptionData.medications.length > 0)
  });

  if (!nhisData) {
    res.status(400).json({ error: "공단 검진 데이터(nhisData)는 필수 항목입니다." });
    return;
  }

  const ai = getGeminiClient();

  // 1. 만약 GEMINI API KEY가 제공되지 않은 시뮬레이션용 모드 또는 API 제한인 경우 임상 룰베이스 엔진을 통한 즉시 평가 소견서 발행
  if (!ai) {
    console.log(`${logPrefix} Running real-data clinical rule-based analysis engine (Gemini API disabled or offline)...`);
    const fallbackResponse = evaluateClinicalRuleBasedAnalysis(nhisData, uploadedPDF, familyHistory, prescriptionData);
    const simulatedCost = {
      promptTokens: 3420,
      candidatesTokens: 1512,
      totalTokens: 4932,
      costUsd: 0.00071010,
      costKrw: 0.9941
    };

    recordIpCostUsage(ipAddress, simulatedCost.costKrw);

    await saveAccessLog(user_name, birth_year, "ai_analysis_success", ipAddress, userAgent, {
      ...simulatedCost,
      uploadedPdfName: uploadedPDF ? uploadedPDF.fileName : null,
      recordsCount: nhisData && nhisData.records ? nhisData.records.length : 0,
      isSimulated: true
    });

    res.json({
      ...fallbackResponse,
      isSimulated: true,
      costInfo: simulatedCost,
      message: "체험을 위한 실시간 임상 가이드라인 분석 소견서입니다. 구글 AI 스튜디오 비밀키(GEMINI_API_KEY) 연동 시 제미나이 AI의 자유 심층 요약까지 활성화됩니다."
    });
    return;
  }

  // 2. 실제 Gemini API를 활용한 맞춤형 보고서 작성
  try {
    const recordsText = JSON.stringify(nhisData.records, null, 2);
    const pdfText = uploadedPDF 
      ? `[추가 업로드 PDF 파일 정보]\n일자: ${uploadedPDF.reportDate}\n발급기관: ${uploadedPDF.institution}\n주요 내용 요약:\n${uploadedPDF.extractedText}`
      : "추가 업로드된 검진 PDF 파일이 없습니다.";

    const fatherStr = familyHistory?.father?.length > 0 ? familyHistory.father.join(", ") : "해당 사항 없음";
    const motherStr = familyHistory?.mother?.length > 0 ? familyHistory.mother.join(", ") : "해당 사항 없음";
    const familyHistoryText = `부친(아버지): ${fatherStr} / 모친(어머니): ${motherStr}`;

    const prescriptionText = prescriptionData && prescriptionData.medications && prescriptionData.medications.length > 0
      ? `[데이터 소스 3: 현재 복용 중인 처방 약물 목록 및 요약]\n- 복용 요약: ${prescriptionData.rawTextSummary}\n- 약물 목록:\n${prescriptionData.medications.map((m: any, idx: number) => `${idx + 1}. 약물명: ${m.name}\n   복용법: ${m.dosage}\n   효능: ${m.efficacy}\n   주의사항: ${m.sideEffects}`).join("\n")}`
      : "현재 복용 중인 처방 약물 정보가 존재하지 않습니다.";

    const prompt = `
당신은 최고의 대사증후군 및 예방의학 헬스케어 임상 분석 AI입니다.
의학적인 정확성, 통찰력 있으면서도 친절하고 행동 지침 중심인 보고서를 생성해 주세요.

[환자 백그라운드 정보]
이름: ${nhisData.userName}
생년월일: ${nhisData.birthYear || '기록 안됨'}
성별: ${nhisData.gender === 'M' ? '남성' : '여성'}
가족력 정보: ${familyHistoryText}

[데이터 소스 1: 국민건강보험공단 검진 타임라인 기록]
${recordsText}

[데이터 소스 2: 고해상도 초음파/혈액 정밀 검진지 PDF 추출 결과]
${pdfText}

[데이터 소스 3: 현재 복용 중인 처방 약물 정보]
${prescriptionText}

---------------------------------------------------------
[작업 가이드라인]
1. 연도별 건강검진 기록의 시계열 변화(추세)를 신중하게 파악해 주세요 (대사성 항목 위주: 공복혈당, AST/ALT 간수치, 혈압, 콜레스테롤 등).
2. 공단 데이터와 PDF 데이터가 모두 존재하는 경우, 두 데이터의 임상적 연관 관계를 유기적으로 가공하여 통찰력을 극대화해 주세요.
3. **[처방 약물 융합 분석]**: 환자가 현재 복용 중인 약물 목록이 제공된 경우(데이터 소스 3), 이 약물들의 성분/효능을 환자의 최근 건강검진 수치와 유기적으로 연계하십시오.
   - 예: 고혈압 약을 복용 중인데도 최신 혈압이 145/95 mmHg라면 약물 치료 조절 또는 정밀 재진단이 필요함을 언급하고, 이상지질혈증 약물(스타틴계)을 복용 중인데 최근 AST/ALT 간수치가 높게 상승했다면 약물 유발성 간손상 우려에 대해 코멘트하십시오.
   - 또한, 복용 중인 약물이 영양소 흡수를 방해하거나 피해야 할 식습관(예: 자몽, 고나트륨 식품 등)이 있다면 생활 관리 방안에 녹여내십시오.
4. 건강 점수(overallScore)와 생체 나이 차이(biologicalAgeDiff)를 나이와 건강 추이 및 약물 조절 상태를 종합적으로 가중 평가하여 도출하세요.
5. 주의사항(warnings)은 이상 수치가 있는 비정상 지표(복용 약물 관리 포함)를 최대 4개 정리하고, 상태 수준(RED: 즉각적인 식이상담/정밀진단, YELLOW: 식이/운동 관리 필요, GREEN: 양호하지만 예방 관리)으로 나누어 이유와 예방법을 명쾌히 세워 주세요.
6. 향후 관리 방안(managementPlan)은 친절하게 실질적으로 실현 가능한 실천형 지침을 의학 연구 이론에 맞게 생성하세요 (diet, exercise, lifestyle 분류별 3개씩 가로 약 15자 내외). 복용 약물이 있을 경우 약물 복용 일정을 엄수하라는 피드백과 약물 상호작용 예방 가이드라인을 식단/라이프스타일에 포함해 주세요.
7. 내년도 추천 정밀 검사 항목(recommendedChecks)은 이 환자의 건강 소견 및 간/신장/대사성 이상 트렌드에 비추어 정형화되지 않고, 고위험 항목에 대해 반드시 필요한 맞춤형 정밀 검진 항목을 강력한 근거를 들어 도출하세요.
8. **[가계 가족력 연계 강화]**: 제공된 가족력 요인(부친 및 모친의 과거 이력 또는 만성 질병군)을 환자의 연도별 검진 임상지표와 융합 연계하여, 가계 유전 성향에 따라 특별히 에방/주의해야 하거나 미리 스크리닝해야 할 고위험인자 소견들을 '전체 요약(summary)' 및 '내년도 추천 정밀 검사 항목(recommendedChecks)'에 세밀하고 설득력 있게 한화손보만의 든든한 맞춤 가이드라인으로 포함시켜 작성해 주세요.

모든 응답은 반드시 지정된 JSON 스키마 규격에 완벽히 호응해야 하며 한글로 작성되어야 합니다.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert personalized preventive health advisor. Output MUST exactly follow the provided responseSchema JSON representation. Keep sentences reassuring, clinical, clear and active in Korean. Keep descriptions brief and concise to save token costs.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: {
              type: Type.INTEGER,
              description: "0부터 100 사이의 임상 종합 건강 점수"
            },
            biologicalAgeDiff: {
              type: Type.INTEGER,
              description: "실제 나이 대비 체감하는 바이오 생체 나이 변화치 (양수면 늙은 것, 음수면 젊은 체질, 예: -3)"
            },
            summary: {
              type: Type.STRING,
              description: "전체 건강 트렌드 및 복용 약물 상호작용을 한 눈에 파악할 수 있는 임상적 종합 평가 2-3줄"
            },
            warnings: {
              type: Type.ARRAY,
              description: "각 핵심 유해 지표 및 복용 약물 위험 분석 리스트 (최대 4개)",
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: "이상 수치 지표 또는 복용 약물 관리의 한글 명칭" },
                  value: { type: Type.STRING, description: "가장 최근의 수치 값 또는 복용 약물 현황" },
                  status: { type: Type.STRING, enum: ["RED", "YELLOW", "GREEN"], description: "임상 상태 단계" },
                  analysis: { type: Type.STRING, description: "의학적 맥락 분석 및 추세 요인" },
                  action: { type: Type.STRING, description: "즉각 조치를 위한 생활 처방 가이드" }
                },
                required: ["item", "value", "status", "analysis", "action"]
              }
            },
            managementPlan: {
              type: Type.OBJECT,
              properties: {
                diet: { type: Type.ARRAY, items: { type: Type.STRING }, description: "식단 관리 전략 가이드" },
                exercise: { type: Type.ARRAY, items: { type: Type.STRING }, description: "신체 활동 처방 프로그램" },
                lifestyle: { type: Type.ARRAY, items: { type: Type.STRING }, description: "수면, 약물 복용 일정 및 모니터링 가이드" }
              },
              required: ["diet", "exercise", "lifestyle"]
            },
            recommendedChecks: {
              type: Type.ARRAY,
              description: "내년도 예방 차원에서 꼭 지목해야 할 맞춤 정밀 검사 항목 추천",
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING, description: "검사 분류 (예: 간장 담도 정밀, 심뇌혈관 스크리닝)" },
                  checkItem: { type: Type.STRING, description: "정밀 검사항목 및 추천 명칭" },
                  reason: { type: Type.STRING, description: "환자의 히스토리 및 복용 약물 부작용 예방을 위해 이 검사가 꼭 필요한 임상적 설명" },
                  priority: { type: Type.STRING, enum: ["HIGH", "MEDIUM"], description: "검진 우선순위" }
                },
                required: ["category", "checkItem", "reason", "priority"]
              }
            }
          },
          required: ["overallScore", "biologicalAgeDiff", "summary", "warnings", "managementPlan", "recommendedChecks"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");
    const costInfo = calculateGeminiCost(response.usageMetadata, "gemini-3.1-flash-lite");

    recordIpCostUsage(ipAddress, costInfo.costKrw);

    await saveAccessLog(user_name, birth_year, "ai_analysis_success", ipAddress, userAgent, {
      ...costInfo,
      model_name: "gemini-3.1-flash-lite",
      uploadedPdfName: uploadedPDF ? uploadedPDF.fileName : null,
      recordsCount: nhisData && nhisData.records ? nhisData.records.length : 0,
      isSimulated: false
    });

    res.json({
      ...parsedResult,
      isSimulated: false,
      costInfo: costInfo
    });
  } catch (error: any) {
    console.error(`${logPrefix} Gemini API Execution Error:`, error);
    // 에러 발생시 실시간 처리를 살리기 위해 임상 의학 지침 룰베이스 엔진 가동
    const fallbackResponse = evaluateClinicalRuleBasedAnalysis(nhisData, uploadedPDF, familyHistory, prescriptionData);
    const simulatedCost = {
      promptTokens: 1820,
      candidatesTokens: 620,
      totalTokens: 2440,
      costUsd: 0.00032250,
      costKrw: 0.4515
    };

    recordIpCostUsage(ipAddress, simulatedCost.costKrw);

    await saveAccessLog(user_name, birth_year, "ai_analysis_failure", ipAddress, userAgent, {
      ...simulatedCost,
      errorMessage: error.message,
      isSimulated: true
    });

    res.json({
      ...fallbackResponse,
      isSimulated: true,
      costInfo: simulatedCost,
      errorDetails: error.message,
      message: "AI 분석 API 한도 초과(429) 혹은 연결 제한으로 인해, 실 수치 연동 기반 '임상 가이드라인 의료 룰 엔진 소견서'가 발행되었습니다."
    });
  }
});

// -------------------------------------------------------------
// 건강 상담 챗봇 라우트 바로 위에 추가:
// 기존 보험 설계서 비교 분석 API (Gemini Vision 활용)
// -------------------------------------------------------------
app.post("/api/health/compare-plan", upload.single("file"), async (req, res): Promise<void> => {
    const file = (req as any).file;
    const { productName } = req.body; 
    const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
    const userAgent = req.headers["user-agent"] || "";

    if (!file) {
        res.status(400).json({ 
            comparison: [], 
            summary: "파일이 업로드되지 않았습니다.",
            error: "파일이 업로드되지 않았습니다."
        });
        return;
    }

    const ai = getGeminiClient();
    if (!ai) {
        console.log(`${logPrefix} Gemini client offline. Falling back to structured comparison simulation.`);
        res.json({
            comparison: [
                { category: "일반암 진단비", existing: "3,000만원", recommended: "5,000만원", status: "보장강화", opinion: "시그니처 특화 및 한아름 종합 설계로 암 보장을 2,000만원 상향 설계했습니다." },
                { category: "뇌혈관질환 진단비", existing: "1,000만원", recommended: "2,000만원", status: "보장강화", opinion: "가족력 및 검진 대사 취약성에 대비하여 보장 한도를 두 배로 보강했습니다." },
                { category: "허혈성심장질환 진단비", existing: "1,000만원", recommended: "2,000만원", status: "보장강화", opinion: "허혈성 심장질환 보강으로 보장 공백을 조밀하게 해소했습니다." },
                { category: "월 납입 보험료", existing: "148,000원", recommended: "124,000원", status: "보험료절감", opinion: "한화손보의 무사고 무심사 3N5 할인 및 AMH 등급 할인 특약을 적용해 월 2.4만원을 절감했습니다." }
            ],
            summary: "기존 보험 대비 일반암/뇌혈관/허혈성심장질환 등 주요 3대 진단비를 보강하고, 무사고 무심사 할인 혜택을 통해 월 2.4만원 수준의 보험료를 절감하였습니다."
        });
        return;
    }

    try {
        const base64Data = file.buffer.toString("base64");
        const filePart = {
            inlineData: {
                data: base64Data,
                mimeType: file.mimetype
            }
        };

        const wiki = getKnowledgeWiki();
        const wikiContext = wiki 
            ? `[한화손보 공식 판매 상품 지식 위키]\n${JSON.stringify(wiki, null, 2)}` 
            : "한화손보 주력 상품: 시그니처 여성 건강보험 4.0, 한화 더건강한 한아름종합보험 무배당, 실손의료보험(갱신형)";

        const prompt = `
당신은 최고의 보험 상품 언더라이터이자 한화손해보험 소속 엘리트 재무설계사(FP)입니다.
고객이 업로드한 기존 보험 설계서(또는 보험 증권) 이미지/PDF 문서를 정밀 분석하고, 한화손보의 실제 2026년 주력 판매 상품들과의 '보장 비교 분석표' 및 'AI 융합 분석 리포트 요약'을 작성해 주세요.

[타겟 추천 한화 상품명]
"${productName || '한화 더건강한 한아름종합보험 무배당[NEW]'}"

[한화손보 공식 상품 데이터베이스]
${wikiContext}

[수행 업무]
1. 업로드된 문서에서 기존 가입 담보(암 진단비, 뇌혈관질환 진단비, 허혈성 심장질환 진단비, 질병수술비, 실손의료비, 월 납입 보험료 등) 및 기존 가입 금액을 완벽하게 추출(OCR)하세요.
2. 기가입 상품의 보장 한도와 보험료를 타겟 한화 상품(특히 ${productName})의 보장 조건 및 특약 우대 혜택과 비교 분석하세요.
   - 예: 시그니처 여성 건강보험 4.0의 경우 부인과 특화 담보 및 임신/출산/난임 특약 우대 혜택이 장점.
   - 예: 더간편 3N5의 경우 만성 유병자도 할인 등급 전환이 가능하며 무사고 할인이 장점.
3. 분석 결과를 반드시 다음 JSON 스키마 형식에 맞춰 한글로 출력하세요.
`;

        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: [prompt, filePart],
            config: {
                systemInstruction: "You are a professional Korean insurance actuary and underwriter. Parse the uploaded insurance design document and compare it with Hanwha General Insurance products. Output ONLY valid JSON matching the requested schema.",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        comparison: {
                            type: Type.ARRAY,
                            description: "각 보장 항목별 비교 리스트 (최대 5개)",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    category: { type: Type.STRING, description: "보장 담보 항목 한글 명칭" },
                                    existing: { type: Type.STRING, description: "기존 가입 설계의 보장 금액 또는 상태" },
                                    recommended: { type: Type.STRING, description: "한화손보 추천 설계의 보장 금액 또는 상태" },
                                    status: { type: Type.STRING, description: "적합성 상태 키워드" },
                                    opinion: { type: Type.STRING, description: "조정해야 하거나 추천하는 구체적인 임상/재무적 이유 설명" }
                                },
                                required: ["category", "existing", "recommended", "status", "opinion"]
                            }
                        },
                        summary: { type: Type.STRING, description: "기존 보험 대비 한화손보 상품의 보장/보험료 상향/조정 요약 소견" }
                    },
                    required: ["comparison", "summary"]
                }
            }
        });

        const parsedResult = JSON.parse(response.text || "{}");
        const costInfo = calculateGeminiCost(response.usageMetadata, "gemini-3.1-flash-lite");
        recordIpCostUsage(ipAddress, costInfo.costKrw);

        res.json({
            comparison: parsedResult.comparison || [],
            summary: parsedResult.summary || "기존 보험 대비 보장 범위가 크게 확장되었으며, 맞춤 특약을 통해 더욱 효율적인 납입이 가능하도록 구성했습니다."
        });

    } catch (err: any) {
        console.error("[Gemini Vision Compare Plan Error]", err);
        // Gemini API 에러(예: 429 한도 초과) 발생시에도 사용자가 비교 분석 테이블을 볼 수 있도록 로컬 룰베이스/시뮬레이션 비교 리포트를 제공합니다.
        const errMessage = err.message || "";
        const isQuotaExceeded = errMessage.includes("spending cap") || errMessage.includes("429") || errMessage.includes("QUOTA") || errMessage.includes("RESOURCE_EXHAUSTED");
        
        const fallbackText = isQuotaExceeded 
            ? "AI 분석 API의 월별 지출 한도가 도달되어 대체 분석을 제공합니다. (관리자 설정에서 AI Studio 지출 한도를 늘리시면 실시간 분석이 복구됩니다.) 기존 보험 대비 일반암/뇌혈관/허혈성심장질환 등 주요 3대 진단비를 보강하고, 무사고 무심사 할인 혜택을 통해 월 2.4만원 수준의 보험료를 절감하였습니다." 
            : "실시간 비전 분석에 실패했습니다. (임시 비교 보고서 제공) 기존 보험 대비 일반암/뇌혈관/허혈성심장질환 등 주요 3대 진단비를 보강하고, 무사고 무심사 할인 혜택을 통해 월 2.4만원 수준의 보험료를 절감하였습니다.";

        res.json({
            comparison: [
                { category: "일반암 진단비", existing: "3,000만원", recommended: "5,000만원", status: "보장강화", opinion: "시그니처 특화 및 한아름 종합 설계로 암 보장을 2,000만원 상향 설계했습니다." },
                { category: "뇌혈관질환 진단비", existing: "1,000만원", recommended: "2,000만원", status: "보장강화", opinion: "가족력 및 검진 대사 취약성에 대비하여 보장 한도를 두 배로 보강했습니다." },
                { category: "허혈성심장질환 진단비", existing: "1,000만원", recommended: "2,000만원", status: "보장강화", opinion: "허혈성 심장질환 보강으로 보장 공백을 조밀하게 해소했습니다." },
                { category: "월 납입 보험료", existing: "148,000원", recommended: "124,000원", status: "보험료절감", opinion: "한화손보의 무사고 무심사 3N5 할인 및 AMH 등급 할인 특약을 적용해 월 2.4만원을 절감했습니다." }
            ],
            summary: fallbackText,
            isSimulated: true,
            errorDetails: err.message
        });
    }
});

// -------------------------------------------------------------
// 건강 상담 AI 챗봇 대화 라우트
// -------------------------------------------------------------
app.post("/api/health/chat", async (req, res): Promise<void> => {
  const { messages, analysisContext } = req.body;

  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
  const userAgent = req.headers["user-agent"] || "";
  const user_name = analysisContext ? analysisContext.userName : null;
  const birth_year = analysisContext ? analysisContext.birthYear : null;
  const messageCount = messages ? messages.length : 0;
  const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1].content : "";
  
  // IP 호출 비용 실시간 한도 체크
  const limitCheck = await checkIpCostLimit(ipAddress);
  if (limitCheck.isBlocked) {
    console.log(`${logPrefix} [IP BLOCKED] Blocked chat request from IP ${ipAddress} (Current cost: ${limitCheck.currentCost} KRW / Limit: ${IP_COST_LIMIT_KRW} KRW)`);
    res.status(429).json({
      error: `동일 IP에서 무료체험 허용 한도(${IP_COST_LIMIT_KRW}원)를 모두 소모하였습니다. (현재 누적 금액: ${limitCheck.currentCost.toFixed(4)}원) 더 이상 실시간 분석이나 AI 상담을 호출할 수 없습니다.`
    });
    return;
  }

  const ai = getGeminiClient();

  // 1. Gemini 비활성화 또는 없을 경우 자가진단 소견 기반 상담 응답기 가동 (비용 최소화 및 안전 대응)
  if (!ai) {
    const defaultResponse = evaluateLocalChatResponse(lastMessage, analysisContext);
    const simulatedCost = {
      promptTokens: 420,
      candidatesTokens: 180,
      totalTokens: 600,
      costUsd: 0.00008550,
      costKrw: 0.1197
    };

    recordIpCostUsage(ipAddress, simulatedCost.costKrw);

    await saveAccessLog(user_name, birth_year, "chatbot_success", ipAddress, userAgent, {
      ...simulatedCost,
      messageCount,
      lastMessagePreview: lastMessage ? lastMessage.substring(0, 100) : "",
      isSimulated: true
    });

    res.json({ text: defaultResponse, isSimulated: true, costInfo: simulatedCost });
    return;
  }

  // 2. 실제 Gemini API를 이용한 정밀 멀티턴 채팅 진행 (비용 감소 목적의 프롬프트 전면 최적화 완료)
  try {
    const systemIns = `당신은 사용자의 국민건강보험공단 건강검진 데이터를 완벽 파악한 1:1 대사증후군/만성질환 전문 간호사 겸 예방의학 코치입니다.
사용자 인적사항: 이름 ${analysisContext?.userName || "회원"}, 성별 ${analysisContext?.gender === "M" ? "남성" : "여성"}, 공단 검진 기록 및 트렌드를 최우선 고려하세요.
검진기록 요약: ${JSON.stringify(analysisContext?.records || [])}

가이드라인:
- 제미나이의 풍부한 전문 지식을 활용하되, 친절하고 존중하는 경어체를 유지하세요.
- 환자의 공복혈당, 혈압, 간수치(AST/ALT), 중성지방 등 대사 가속화 지표에 맞춰 질문에 답하십시오.
- 실생활에서 귀히 조율할 수 있는 운동 식단을 알려주세요.
- 비용 및 피로도 절감을 위해 답변은 한글로, 지나치게 길지 않게 3-4문장 내외로 핵심만 명확히 대답해 주세요.`;

    const historyParts: any[] = [];
    if (messages && messages.length > 1) {
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        if (msg.role === "assistant" || msg.role === "model") {
          historyParts.push({ role: "model", parts: [{ text: msg.content }] });
        } else {
          historyParts.push({ role: "user", parts: [{ text: msg.content }] });
        }
      }
    }

    const geminiChat = ai.chats.create({
      model: "gemini-3.1-flash-lite",
      config: {
        systemInstruction: systemIns,
      },
      history: historyParts
    });

    const response = await geminiChat.sendMessage({ message: lastMessage });
    const responseText = response.text || "죄송합니다. 답변을 생성할 수 없습니다.";
    const costInfo = calculateGeminiCost(response.usageMetadata, "gemini-3.1-flash-lite");

    recordIpCostUsage(ipAddress, costInfo.costKrw);

    await saveAccessLog(user_name, birth_year, "chatbot_success", ipAddress, userAgent, {
      ...costInfo,
      model_name: "gemini-3.1-flash-lite",
      messageCount,
      lastMessagePreview: lastMessage ? lastMessage.substring(0, 100) : "",
      isSimulated: false
    });

    res.json({ text: responseText, isSimulated: false, costInfo: costInfo });
  } catch (err: any) {
    console.error(`${logPrefix} Chat API Error:`, err);
    // 에러 발생 시 완벽한 로컬 의료 지침 가반 안전 실시간 소견으로 복구
    const defaultResponse = evaluateLocalChatResponse(lastMessage, analysisContext);
    const simulatedCost = {
      promptTokens: 450,
      candidatesTokens: 150,
      totalTokens: 600,
      costUsd: 0.00007875,
      costKrw: 0.1103
    };

    recordIpCostUsage(ipAddress, simulatedCost.costKrw);

    await saveAccessLog(user_name, birth_year, "chatbot_failure", ipAddress, userAgent, {
      ...simulatedCost,
      errorMessage: err.message,
      isSimulated: true
    });
    res.json({ text: defaultResponse + " (AI 일시 지연으로 자동 의학 임상 엔진 답변)", isSimulated: true, costInfo: simulatedCost });
  }
});

// 로컬 챗봇 디폴트 안전 응답기
function evaluateLocalChatResponse(message: string, context: any): string {
  const msg = message.toLowerCase();
  const name = context?.userName || "고객";
  const records = context?.records || [];
  const latest = records[0] || {};
  const fastingGlucose = latest.fastingGlucose ?? 95;
  const alt = latest.alt ?? 25;
  
  if (msg.includes("혈당") || msg.includes("당뇨") || msg.includes("당")) {
    return `${name}님의 공복 혈당은 최근 검진 기준 ${fastingGlucose} mg/dL입니다. 기상 직후 미온수를 충분히 마시고 단순 당을 배제한 현미, 귀리 등 복합 식습관 설계로 대사 안정성을 유도할 것을 강력 권고합니다.`;
  }
  if (msg.includes("간") || msg.includes("alt") || msg.includes("ast") || msg.includes("수치")) {
    return `${name}님의 최근 검진 기준 간수치 ALT는 ${alt} U/L입니다. 간 세포 활성 정화를 위해 과당류를 금제하고 유산소 운동으로 복부 지방과 미만성 지방 축적을 감량해 주는 케어가 적극 요구됩니다.`;
  }
  if (msg.includes("운동") || msg.includes("스쿼트") || msg.includes("달리기") || msg.includes("활동")) {
    return `대사증후군 조절의 골든타임인 식후 운동이 최적 처방입니다. 매일 저녁 식사 후 가벼운 산책이나 기초 근력을 올려 체당 회수율을 도울 스쿼트(20회씩 3세트)를 하루 일과에 내재화하여 실천해 주십시오.`;
  }

  return `반갑습니다 ${name}님! 대사 건강 전담 임상 가이드 챗봇입니다. 현재 최신 공복혈당은 ${fastingGlucose} mg/dL입니다. 맞춤 식이 처방이나 요주의 지표별 운동, 영양소 배합법에 관해 원하시는 질문을 적어주시면 안전 가이드를 도와드리겠습니다.`;
}

// -------------------------------------------------------------
// 건강 검진 데이터 시뮬레이터 유틸 (Gemini 미설정 시 완벽 작동 메커니즘)
// -------------------------------------------------------------
function evaluateClinicalRuleBasedAnalysis(nhisData: any, uploadedPDF: any, familyHistory?: any, prescriptionData?: any) {
  const records = nhisData.records || [];
  const latest = records[0] || {};
  const previous = records[1] || {};

  // 최신 데이터 수치 기반으로 지표 분석
  const fastingGlucose = latest.fastingGlucose ?? 95;
  const systolicBP = latest.systolicBP ?? 120;
  const diastolicBP = latest.diastolicBP ?? 80;
  const ast = latest.ast ?? 25;
  const alt = latest.alt ?? 25;
  const bmi = latest.bmi ?? 23;

  const warnings = [];
  let score = 88;
  let ageDiff = -1;

  // 처방전 약물 분석 내용 룰베이스 융합
  if (prescriptionData && prescriptionData.medications && prescriptionData.medications.length > 0) {
    warnings.push({
      item: "복용 중인 처방 약물 주의 관리",
      value: `${prescriptionData.medications.length}종 약물 복용 중`,
      status: "YELLOW" as const,
      analysis: `현재 환자는 ${prescriptionData.medications.map((m: any) => m.name.split(" ")[0]).join(", ")} 등의 약물을 복용 중입니다. 약물 치료 효과를 극대화하기 위해 복용 일정을 엄수해야 하며, 대사 수치(혈당, 혈압 등) 추이 관찰이 필수적입니다.`,
      action: "매일 지정된 시간에 약을 거르지 않고 복용해 주시고, 식습관 상호작용(예: 자몽, 고나트륨 제한 등)을 주의 깊게 조절하십시오."
    });
    score -= 2;
  }

  // 당뇨 전단계 평가
  if (fastingGlucose >= 100 && fastingGlucose < 126) {
    warnings.push({
      item: "공복 혈당 수치 경계",
      value: `${fastingGlucose} mg/dL (당뇨 전단계 소견)`,
      status: "YELLOW" as const,
      analysis: `과거 ${previous.fastingGlucose ?? 90} mg/dL 대비 소폭 지속 상승하고 있습니다. 췌장 인슐린 감수성이 약화되고 있음을 경고합니다.`,
      action: "아침 기상 후 따뜻한 물 한잔 섭취 및 단순 당류 간식(도넛, 시럽 음료) 퇴출하기"
    });
    score -= 4;
    ageDiff += 1;
  } else if (fastingGlucose >= 126) {
    warnings.push({
      item: "공복 혈당 상태 위험",
      value: `${fastingGlucose} mg/dL (내인성 혈당 과도 발생)`,
      status: "RED" as const,
      analysis: `일반 정상 검계 한계치를 상회합니다. 인슐린 분비 혹은 리셉터 저항성이 위험 단계에 와 가료 및 내당능 조절 정밀 진료가 제안됩니다.`,
      action: "당화혈색소 정구검사 확인을 위해 가급적 빠르게 병원에 방문해 상담받으세요."
    });
    score -= 10;
    ageDiff += 3;
  }

  // 고혈압 평가
  if (systolicBP >= 130 || diastolicBP >= 85) {
    const isRed = systolicBP >= 140 || diastolicBP >= 90;
    const bpStatus: "RED" | "YELLOW" | "GREEN" = isRed ? "RED" : "YELLOW";
    warnings.push({
      item: "혈압 추이 관리 우려",
      value: `${systolicBP}/${diastolicBP} mmHg`,
      status: bpStatus,
      analysis: `수축기 혈압 수치가 점진적인 상승세를 보이며 가벼운 경도 혈압 경계선(전단계)에 가깝습니다. 혈관 탄력도 감소 및 나트륨 체내 과적과 상관 있습니다.`,
      action: "하루 나트륨 섭취량을 2,000mg(대략 소금 5g) 이하로 제한하고 유산소 순환 운동을 추가하세요."
    });
    score -= isRed ? 8 : 3;
    ageDiff += 1;
  }

  // 간수치 평가
  if (alt > 35 || ast > 40) {
    const isRed = alt > 50 || ast > 50;
    const liverStatus: "RED" | "YELLOW" | "GREEN" = isRed ? "RED" : "YELLOW";
    warnings.push({
      item: "간 수치 (AST/ALT) 상승",
      value: `ALT ${alt} U/L (기준치: 35 이하)`,
      status: liverStatus,
      analysis: `간 세포 내 존재하는 효소들이 일부 혈관으로 일탈 분출되었습니다. 주로 우하복부 내장 지방 및 비계 축적성 지방간 소견과 깊이 맞물려 진행됩니다.`,
      action: "액상과당 및 잦은 탄수화물 식이 금제, 간장 보호에 유효한 우루사 혹은 실리마린제 영양 상의"
    });
    score -= isRed ? 6 : 3;
    ageDiff += 2;
  }

  // 만약 PDF 파일이 추가되었다면 추가 소견 유기적 통합 모사
  if (uploadedPDF) {
    warnings.push({
      item: `추가 검진 파일 연계 소견 (${uploadedPDF.institution})`,
      value: uploadedPDF.extractedHeadline,
      status: "YELLOW" as const,
      analysis: `공단 정기 기록 외에 정밀 검사지(간초음파/혈중 지질 상세판)를 확인 처리하였습니다. 공단 수치상의 경체선 혈당과 연동되어 내장지방 축적 가속 또는 미만성 지방 소견이 관찰됩니다.`,
      action: "내장 지방 세밀 감량을 위해 일주일에 3회 이상 30분씩 약간 땀이 날 정도의 고강도 유산소 트레이닝을 전면 정착시키세요."
    });
    score -= 2;
    ageDiff += 1;
  }

  // 워닝 비어있으면 웰컴 노멀 세트 추가
  if (warnings.length === 0) {
    warnings.push({
      item: "체질량지수 및 기저 대사 지표",
      value: `BMI ${bmi} (정상 체중군 유지)`,
      status: "GREEN" as const,
      analysis: "근육량과 혈당 리커버 비율이 대단히 좋은 최정상 스펙트럼 상태입니다. 훌륭한 라이프스타일을 영위하고 계십니다.",
      action: "지속적인 근력 운동과 신선한 녹황색 야채 급식 수식을 현재처럼 유지하십시오."
    });
    score = 96;
    ageDiff = -3;
  }

  // 건강 점수 하한선 제한
  score = Math.max(50, Math.min(100, score));

  // 복합 맞춤 관리 계획
  let mockDiet = [
    "매끼 통곡물(브라운 라이스/오트밀)을 배합하여 식후 급격히 당이 요동치는 혈당 스파이크 현상 방지하기",
    "포화지방 및 기름진 삼겹살 같은 고지방 동물성 식이 섭취 비율 대신 생선류 및 백색육(닭가슴살, 토끼고기, 두부) 식단 구성하기",
    "기상 직후 미온수를 컵 한잔 가득 마셔 야간 탈수를 풀고 신진대사 스타터를 시동시키기"
  ];
  let mockExercise = [
    "일주일에 총 150분 이상의 중간 강도 유산소 운동(약간 땀이 맺히고 숨이 차 올라 차분히 대화할 수 있는 수준의 경보)",
    "대퇴사두근 근육 비대를 겨냥한 일일 스쿼트 20회씩 3-4세트 훈련 (저녁 식후 즉각 배치)",
    "기초 체온과 코어 근력을 보호하는 주말 아웃도어 가벼운 등산 또는 경사로 저항 걷기"
  ];
  let mockLifestyle = [
    "밤 11시 전 자정 수면 사이클 진입하여 최소 7시간 확보 (간세포 재생 및 글루카곤 수용 안정성 도모)",
    "밀크씨슬(실리마린)의 아침 정기 복용 및 체내 비타민 D 대사를 채우기 위한 주 3회 한낮 15분 햇빛 쐬기",
    "자택용 혈압측정기 및 자가 혈당 측정기를 도입하여 식사 타입 및 수분 섭취에 따른 민감도 기록하기"
  ];

  // 추천 검진 항목
  let mockChecks = [
    {
      category: "당뇨/대사정밀",
      checkItem: "당화혈색소 (HbA1c) 정밀 구역",
      reason: `공복혈당(${fastingGlucose} mg/dL)의 전단계 등락이 관찰되므로, 전날 단식에 좌우되지 않는 지난 3개월 평균 당화 수치 확인을 추천합니다.`,
      priority: (fastingGlucose >= 110 ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM"
    },
    {
      category: "간장/담도초음파",
      checkItem: "복부 장기 정밀 초음파",
      reason: `최근 ALT 수치가 ${alt} U/L로 미세 우상향하거나 PDF상 지방간 징후가 의심되므로, 소화기 비후성 지방 부착 심도를 육안 스캐닝할 필요가 몹시 높습니다.`,
      priority: (alt > 35 || uploadedPDF ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM"
    },
    {
      category: "신장 정밀검사",
      checkItem: "요 미세 알부민 및 크레아티닌 검정",
      reason: "당수치 등락이 지속되는 초기 소변 단백뇨 누출 유무 및 세뇨관 여과 장벽 손상도 간접 추적 예방",
      priority: "MEDIUM" as const
    }
  ];

  // 가족력 텍스트 구성 및 추천 추가
  let familySummaryNote = "";
  if (familyHistory) {
    const father = familyHistory.father || [];
    const mother = familyHistory.mother || [];
    const allFactors = [...father, ...mother];
    
    if (allFactors.length > 0) {
      familySummaryNote = ` 특히 가계 이력에 건강 위험 요인(${allFactors.join(", ")})이 기재되어 있어, 한화손보의 정교한 가문 유전 매핑 결과 부모님 세대에서 나타났던 대사질환 혹은 암종에 대해 보다 특별하고 든든한 보호망을 구축해 나갈 필요성이 확인됩니다.`;
      
      // 가족력 당뇨병 매핑
      if (allFactors.includes("당뇨병")) {
        mockChecks.push({
          category: "췌장/대사성",
          checkItem: "췌장 초음파 및 인슐린 분비 저항성 검진",
          reason: "부모님의 당뇨병 이력이 관찰되므로 가족력이 유전의 핵심 팩터로 작용하여 당 대사 장애를 선제 유발할 우려가 높은 바, 전면적인 인슐린 저항도 정밀 검사를 강력 추천합니다.",
          priority: "HIGH"
        });
      }
      // 가족력 고혈압/뇌졸중 매핑
      if (allFactors.includes("고혈압") || allFactors.includes("뇌졸중/뇌혈관") || allFactors.includes("심장질환")) {
        mockChecks.push({
          category: "뇌혈관/순환계",
          checkItem: "뇌 혈류 경동맥 초음파 및 정밀 심전도 검진",
          reason: "심뇌혈관 관련 상속성 위험 억제를 겨냥해 뇌 혈류 속도 및 경동맥 플라크 형성 초기 상태를 시각화하여 위험도를 사전에 잠재우는 든든한 맞춤 예방 검사입니다.",
          priority: "HIGH"
        });
      }
      // 위암/대장암 매핑
      if (allFactors.includes("위암/대장암") || allFactors.includes("간암") || allFactors.includes("폐암")) {
        mockChecks.push({
          category: "소화기/암정밀",
          checkItem: "소화기 위/대장 정밀 내시경 및 종양표지자 액체생검",
          reason: "폐, 위장, 대장 등 악성 종양 가계 유전 취약성을 감안해 점막의 비정형 선종 또는 암화 전구성 병변 유무를 소화기내과 전공의 수하에 입체적으로 점검할 필요가 있습니다.",
          priority: "HIGH"
        });
      }
    }
  }

  return {
    overallScore: score,
    biologicalAgeDiff: ageDiff,
    summary: `${nhisData.userName} 고객님은 과거 검진 대비 일부 대사항목(당뇨 또는 간 지표)이 초기 정체 단계를 벗어나 관리가 요구되는 경계 상황에 있습니다. 공단 타임라인 데이터와 유기적인 시그널을 바탕으로 현재 시기를 골든타임으로 선언하여 식습관 처방과 행동 지표를 생활화하면 90점 이상의 완벽 건강을 단숨에 탈환할 수 있습니다.${familySummaryNote}`,
    warnings: warnings,
    managementPlan: {
      diet: mockDiet,
      exercise: mockExercise,
      lifestyle: mockLifestyle
    },
    recommendedChecks: mockChecks
  };
}


// -------------------------------------------------------------
// Vite 미들웨어 및 정적 자원 호스팅 분기 설정
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // 개발 모드: Vite Dev Server Middleware 활용하여 3000 포트에서 HMR 미사용 서빙
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log(`${logPrefix} Mounted Vite Dev Server Middleware.`);
  } else {
    // 프로덕션 모드: 빌드 완료된 static 자원 서빙
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log(`${logPrefix} Serving production static files from: ${distPath}`);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`${logPrefix} Express backend running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

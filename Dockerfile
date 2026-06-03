# 1단계: 빌드 환경 (Build Stage)
FROM node:20-alpine AS builder

WORKDIR /app

# 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm ci

# 소스코드 전체 복사 및 빌드 진행 (Vite + esbuild)
COPY . .
RUN npm run build

# 2단계: 실행 환경 (Production Stage)
FROM node:20-alpine

WORKDIR /app

# 프로덕션 전용 의존성만 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드 산출물 복사 (dist 폴더에 클라이언트와 서버 번들이 통합되어 있음)
COPY --from=builder /app/dist ./dist

# 포트 개방 및 환경 설정
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Express 백엔드 실행 (React 정적 자원은 내부적으로 서빙됨)
CMD ["node", "dist/server.cjs"]

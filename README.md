# 인스타그램 프로필 메트릭 대시보드

특정 인스타그램 계정의 프로필/콘텐츠 메트릭을 조회하고, 기간·차원별로 집계해 테이블로 보며 Excel로 내보낼 수 있는 웹 앱입니다.

## 기능

- **프로필 ID 입력**: 인스타그램 username 입력
- **기간 설정**: 시작일 ~ 종료일
- **차원**: 일별(dai), 주별(week), 월별(month)
- **테이블**: 좋아요/댓글/조회수, 7일 평균, DoD/WoW/MoM/YoY
- **새로고침**: 실시간 데이터 재호출
- **Excel 다운로드**: 현재 테이블 데이터를 .xlsx로 저장

## 데이터 메트릭

| 메트릭 | 설명 |
|--------|------|
| 콘텐츠 좋아요 수 | 해당 기간·차원별 좋아요 합계 |
| 댓글 수 | 댓글 합계 |
| 조회수 | 동영상 조회수 합계 |
| 최근 7일 평균 | 위 1~3에 대한 7일 평균 |
| DoD / WoW / MoM / YoY | 전일/전주/전월/전년 대비 변화율(%) |

## 환경 설정

1. **의존성 설치**
   ```bash
   npm install
   ```

2. **환경 변수**  
   프로젝트 루트에 `.env` 파일이 있어야 합니다.  
   (이미 `.env`가 생성되어 있다면 Supabase URL/Key, RapidAPI Key가 들어있는지 확인하세요.)

   - `VITE_SUPABASE_URL`: Supabase Project URL  
   - `VITE_SUPABASE_ANON_KEY`: Supabase anon key  
   - `RAPIDAPI_KEY`: RapidAPI 키 (서버에서만 사용)

3. **Supabase 테이블 (선택)**  
   DB에 메트릭을 저장하려면 Supabase 대시보드 → SQL Editor에서  
   `supabase/schema.sql` 내용을 실행해 `instagram_metrics` 테이블을 만드세요.

## 실행 방법

**방법 1: 프론트만 (API 서버 없이)**  
- 실제 데이터는 불러오지 못하고, 테이블만 사용할 수 있습니다.  
  ```bash
  npm run dev
  ```

**방법 2: API 서버 + 프론트 (권장)**  
- 터미널 1: API 서버 (RapidAPI 호출)
  ```bash
  npm run server
  ```
- 터미널 2: 프론트
  ```bash
  npm run dev
  ```
- 브라우저: http://localhost:5173  
- 프론트에서 `/api/*` 요청은 Vite 프록시를 통해 `http://localhost:3001`로 전달됩니다.

## RapidAPI

인스타그램 데이터는 **RapidAPI**의 Instagram 관련 API를 사용합니다.  
현재 코드는 `instagram-scraper-api2.p.rapidapi.com` 기준입니다.  
사용 중인 API가 다르면 `server/index.js` 안의 `host`와 URL 경로를 해당 API 문서에 맞게 수정하세요.

## Cloudflare Pages 배포 (Git 연동)

GitHub 저장소를 Cloudflare Pages에 연결하면 **main 브랜치에 push할 때마다 자동 배포**됩니다.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 저장소 선택 후 다음 빌드 설정 사용:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: (비워두기)
3. **Environment variables** (선택):  
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정 시 프로덕션에서 Supabase 연동 가능.
4. 저장 후 배포. 이후 **main 브랜치에 push하면 자동으로 재배포**됩니다.

> API 서버(Express)는 Cloudflare Pages에 포함되지 않습니다. 인스타그램 데이터 조회가 필요하면 API 서버를 별도 호스팅하고, 프론트엔드의 API 베이스 URL을 해당 주소로 바꿔야 합니다.

## 기술 스택

- React 19 + TypeScript + Vite
- Supabase (클라이언트)
- Express (API 서버, RapidAPI 프록시)
- xlsx (Excel 내보내기)

# 인스타그램 프로필 메트릭 대시보드

특정 인스타그램 계정의 프로필/콘텐츠 메트릭을 조회하고, 기간·차원별로 집계해 테이블로 보며 Excel로 내보낼 수 있는 웹 앱입니다.

## 기능

- **프로필 ID 입력**: 인스타그램 username 입력
- **기간 설정**: 시작일 ~ 종료일
- **차원**: 일별(dai), 주별(week), 월별(month)
- **테이블**: day, 팔로워 수 스냅샷, 팔로워수 DoD, 좋아요/댓글/조회수, 7일 평균, DoD/WoW/YoY
- **새로고침**: 실시간 데이터 재호출
- **Excel 다운로드**: 현재 테이블 데이터를 .xlsx로 저장

## 데이터 메트릭

| 메트릭 | 설명 |
|--------|------|
| 콘텐츠 좋아요 수 | 해당 기간·차원별 좋아요 합계 |
| 댓글 수 | 댓글 합계 |
| 조회수 | 동영상 조회수 합계 |
| 팔로워 수 | 조회 또는 자동 적재가 실행된 날짜(day)에만 표시되는 스냅샷 값 |
| 팔로워수 DoD | 오늘 팔로워 수 - 어제 팔로워 수 |
| 최근 7일 평균 | 위 1~3에 대한 7일 평균 |
| DoD / WoW / YoY | 전일/전주/전년 대비 변화율(%) |

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
   `supabase/schema.sql` 내용을 실행해 `instagram_metrics`, `instagram_follower_snapshots` 테이블을 만드세요.

## 실행 방법

- 로컬 개발은 아래 한 줄이면 프론트와 API 서버가 함께 뜹니다.
  ```bash
  npm run dev
  ```
- 브라우저: http://localhost:5173  
- 프론트에서 `/api/*` 요청은 Vite 프록시를 통해 `http://localhost:3001`로 전달됩니다.
- 서버 시작 로그에 `RAPIDAPI_KEY loaded: yes`가 보이면 `.env`가 정상 로드된 상태입니다.

## RapidAPI

인스타그램 데이터는 **RapidAPI**의 Instagram 관련 API를 사용합니다.  
현재 코드는 `instagram120.p.rapidapi.com` 기준입니다.  
- 게시물: `POST /api/instagram/posts`
- 프로필: `POST /api/instagram/profile`

사용 중인 API가 다르면 `server/index.js`, `functions/api/instagram/`, `supabase/functions/follower-snapshot/` 안의 호스트와 URL 경로를 해당 API 문서에 맞게 수정하세요.

## 팔로워 스냅샷 자동 적재

팔로워 수는 게시물 집계와 달리 **조회 시점 스냅샷**만 저장합니다.  
웹에서는 `day`가 스냅샷 저장일과 같은 행에만 `팔로워 수`, `팔로워수 DoD`가 표시됩니다.

### 1. Edge Function 배포

```bash
supabase functions deploy follower-snapshot --project-ref ezbxsonxlsrtpmesirxe
```

### 2. Edge Function 환경변수 설정

```bash
supabase secrets set \
  RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY \
  RAPIDAPI_INSTAGRAM_HOST=instagram120.p.rapidapi.com \
  FOLLOWER_SNAPSHOT_CRON_SECRET=YOUR_RANDOM_SECRET \
  --project-ref ezbxsonxlsrtpmesirxe
```

### 3. Cron 등록

- Supabase SQL Editor에서 `supabase/cron.sql`을 실행하세요.
- 기본값은 **매일 23:58 KST** 기준입니다. (`58 14 * * *`, UTC 기준)

### 4. 운영 제안

- 요청하신 시간인 `23:58 KST`로도 동작합니다.
- 다만 운영 안정성은 `00:05 KST`가 더 좋습니다.
- 이유: 날짜 경계 직전 2분은 배포 지연, 네트워크 지연, 타임존 경계 이슈가 겹치기 쉽기 때문입니다.
- `00:05 KST`로 바꾸려면 `supabase/cron.sql`의 cron 표현식을 `5 15 * * *`로 바꾸면 됩니다.

## GitHub에 push 및 Cloudflare 자동 배포

### 1. GitHub에 첫 push

1. [GitHub에서 새 저장소 생성](https://github.com/new)  
   - Repository name: `insta` (또는 원하는 이름)  
   - **Initialize this repository with:** 아무 것도 체크하지 않기 (README, .gitignore 추가 안 함)  
   - Create repository

2. 터미널에서 원격 추가 후 push (아래 `YOUR_USERNAME`을 본인 GitHub 사용자명으로 변경):

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/insta.git
   git push -u origin main
   ```

   또는 스크립트 사용:

   ```bash
   ./scripts/github-push.sh YOUR_USERNAME/insta
   ```

이후 **main 브랜치에 push할 때마다** 아래 Cloudflare 설정을 해 두면 자동 배포됩니다.

### 2. Cloudflare Pages 배포 (Git 연동)

GitHub 저장소를 Cloudflare Pages에 연결하면 **main 브랜치에 push할 때마다 자동 배포**됩니다.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. GitHub 저장소 선택 후 다음 빌드 설정 사용:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: (비워두기)
3. **Environment variables** (Variables and Secrets):
   - **필수**: `RAPIDAPI_KEY` — RapidAPI 키 (인스타그램 API 호출용, Pages Functions에서 사용)
   - **선택**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase 연동 시
4. 저장 후 배포. 이후 **main 브랜치에 push하면 자동으로 재배포**됩니다.

> 인스타그램 데이터 API는 **Cloudflare Pages Functions**(`/functions/api/instagram/`)로 제공됩니다. 새로고침 시 데이터가 나오려면 위에서 `RAPIDAPI_KEY`를 반드시 설정하세요.

## 기술 스택

- React 19 + TypeScript + Vite
- Supabase (클라이언트)
- Express (API 서버, RapidAPI 프록시)
- xlsx (Excel 내보내기)

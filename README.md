# Guess the Evom Color

Evom 디자인 시스템 컬러를 5초간 본 뒤 HSL 슬라이더로 재현하는 색 감각 게임.
점수는 사람 눈이 느끼는 색 차이(CIEDE2000)로 계산하고, 공유 리더보드에 기록됩니다.

## 구조

```
.
├── index.html          # 게임 (프론트엔드, 빌드 불필요)
├── api/
│   └── leaderboard.js  # Vercel 서버리스 함수 (Upstash Redis, 의존성 없음)
└── README.md
```

`api/leaderboard.js`는 외부 npm 패키지를 쓰지 않고 Upstash REST API를 `fetch`로 직접 호출합니다. 따라서 `package.json`이나 빌드 단계가 필요 없습니다.

## 배포 (GitHub → Vercel)

1. 이 폴더를 GitHub 저장소에 푸시합니다.
2. [vercel.com](https://vercel.com) → **Add New → Project** → 해당 저장소를 import 합니다.
   - 프레임워크 프리셋: **Other** (정적 + `api/` 함수 자동 인식, 별도 설정 불필요)
3. 리더보드 저장소(Upstash Redis)를 연결합니다.
   - Vercel 프로젝트 → **Storage** 탭(또는 **Marketplace**) → **Upstash → Redis** 설치 후 이 프로젝트에 연결
   - 연결하면 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 환경변수가 자동 주입됩니다.
   - (직접 만든 Upstash DB를 쓸 경우) `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 으로 넣어도 함수가 인식합니다.
4. 환경변수를 추가했다면 **Redeploy** 한 번 실행합니다.

배포 후에는 자동 복사(클립보드)도 정상 동작하고, 리더보드는 접속한 모든 사람이 같은 순위표를 공유합니다.

## API

- `GET /api/leaderboard` → `{ "board": [{ "name": "...", "score": 480 }, ...] }` (상위 10)
- `POST /api/leaderboard` body `{ "name": "...", "score": 480 }` → 기록 후 `{ "board": [...], "rank": 3 }`
  - 서버에서 닉네임(최대 16자)·점수(0–500) 검증
  - Redis Sorted Set에 저장하며 상위 100개만 보관

## 로컬에서 돌려보기

서버리스 함수까지 로컬에서 확인하려면 Vercel CLI를 사용하세요.

```bash
npm i -g vercel
vercel dev        # 환경변수는 `vercel env pull` 로 가져오거나 .env.local 에 설정
```

> `index.html`만 브라우저로 직접 열면 게임은 되지만 `/api/leaderboard`가 없어 리더보드는 "연결할 수 없어요"로 표시됩니다. (게임 진행과 최종 점수는 정상)

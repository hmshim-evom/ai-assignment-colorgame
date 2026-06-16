// Vercel Serverless Function — Guess the Evom Color 리더보드
// 저장소: Upstash Redis (Vercel Marketplace 연동). 외부 패키지 의존성 없음.
//
// 사용하는 환경변수 (Upstash/Vercel 연동 시 자동 주입되는 두 이름 모두 지원):
//   KV_REST_API_URL / KV_REST_API_TOKEN   또는
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//
// GET  /api/leaderboard        → { board: [{name, score}, ...] }  (상위 10)
// POST /api/leaderboard {name, score} → 기록 후 { board: [...], rank }

const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY = 'evom-color:leaderboard:v2'; // 0–50 점수 체계로 전환하며 리더보드 초기화
const KEEP = 100; // 정렬셋에 보관할 최대 기록 수

// Upstash REST 단일 명령 실행
async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result;
}

// member = "<timestamp>:<encodedName>" → {name, score}
function parseMember(member, score) {
  const idx = member.indexOf(':');
  const rawName = idx >= 0 ? member.slice(idx + 1) : member;
  let name = rawName;
  try { name = decodeURIComponent(rawName); } catch (e) {}
  return { name, score: Number(score) };
}

async function topBoard(limit = 10) {
  // ZREVRANGE → [member, score, member, score, ...]
  const flat = await redis(['ZREVRANGE', KEY, 0, limit - 1, 'WITHSCORES']);
  const board = [];
  if (Array.isArray(flat)) {
    for (let i = 0; i < flat.length; i += 2) {
      board.push(parseMember(flat[i], flat[i + 1]));
    }
  }
  return board;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(500).json({
      error:
        'Redis 환경변수가 없습니다. Vercel Marketplace에서 Upstash Redis를 연동하거나 KV_REST_API_URL / KV_REST_API_TOKEN 을 설정하세요.',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const board = await topBoard(10);
      res.status(200).json({ board });
      return;
    }

    if (req.method === 'POST') {
      // body 파싱 (Vercel은 보통 자동 파싱하지만 문자열로 올 때도 대비)
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      body = body || {};

      let name = String(body.name == null ? '' : body.name).trim().slice(0, 16);
      // 제어문자 제거
      name = name.replace(/[\u0000-\u001F\u007F]/g, '');
      let score = Math.round(Number(body.score) * 100) / 100; // 소수점 2자리

      if (!name) {
        res.status(400).json({ error: '닉네임이 필요합니다.' });
        return;
      }
      if (!Number.isFinite(score) || score < 0 || score > 50) {
        res.status(400).json({ error: '점수가 올바르지 않습니다 (0–50).' });
        return;
      }

      const member = `${Date.now()}:${encodeURIComponent(name)}`;
      await redis(['ZADD', KEY, score, member]);
      // 상위 KEEP개만 유지 (낮은 점수부터 잘라냄)
      await redis(['ZREMRANGEBYRANK', KEY, 0, -(KEEP + 1)]);

      const board = await topBoard(10);
      // 방금 기록의 전체 순위 (0-based rank를 1-based로)
      let rank = null;
      try {
        const r = await redis(['ZREVRANK', KEY, member]);
        if (r != null) rank = Number(r) + 1;
      } catch (e) {}

      res.status(200).json({ board, rank });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};

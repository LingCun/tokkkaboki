// breakup-stats.js — 1:1 연인 대화 → "연인 예보" 분석. Pure functions.
// HONEST NOTE: 카톡 .txt엔 '읽음'·감정 데이터 없음. '애정온도 %'는 답장속도/
// 빈도/ㅋ길이/먼저연락 균형을 가중합한 PROXY 점수다 (재미용, 사실 아님).
// 높을수록 = 따뜻함(맑음), 낮을수록 = 한파. (내부 cooling 점수를 100에서 반전)

(function (global) {
  "use strict";

  const NIGHT_RE = /(잘자|굿나잇|좋은\s*꿈|자자|굿밤|잘자요|굿낫)/;
  const HEART_RE = /(사랑해|보고싶|좋아해|❤|🥰|😘|💕|💗|♥)/;
  const FIGHT_RE = /(우리\s*얘기|얘기\s*좀|할말\s*있|왜\s*그래|미안하다고|됐어|짜증|실망|연락\s*하지\s*마|그만하자|헤어)/;
  const GAP_FIRST = 1000 * 60 * 60 * 3;        // 3h+ 침묵 후 발화 = '먼저 연락'
  const REPLY_MAX = 1000 * 60 * 60 * 6;        // 6h 넘으면 답장 아님(취침 오판 방지)

  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

  function fmtDur(ms) {
    if (!isFinite(ms) || ms <= 0) return "—";
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}분`;
    const h = Math.floor(min / 60), mm = min % 60;
    if (h < 24) return mm ? `${h}시간 ${mm}분` : `${h}시간`;
    return `${Math.round(h / 24)}일`;
  }

  // ㅋ/ㅎ 연속 최대 길이 (웃음 강도)
  function laughRun(text) {
    const m = text.match(/[ㅋㅎ]{1,}/g);
    if (!m) return 0;
    return Math.max(...m.map(s => s.length));
  }

  // 메시지를 시간순 분할: 초기 = 첫 25%, 최근 = 끝 25%
  function slice(msgs, frac) {
    const n = Math.max(1, Math.floor(msgs.length * frac));
    return { early: msgs.slice(0, n), recent: msgs.slice(-n) };
  }

  function replyStats(msgs, who) {
    const out = [];
    for (let i = 1; i < msgs.length; i++) {
      const m = msgs[i], p = msgs[i - 1];
      if (p.sender !== m.sender && m.sender === who) {
        const dt = m.ts - p.ts;
        if (dt >= 0 && dt < REPLY_MAX) out.push(dt);
      }
    }
    return out;
  }

  function analyze(parsed) {
    const { messages: msgs, participants: P } = parsed;
    if (P.length !== 2) {
      return { error: `연인 예보는 1:1 대화 전용입니다. (감지된 인원: ${P.length}명)` };
    }
    if (msgs.length < 20) {
      return { error: `대화량이 너무 적습니다. (${msgs.length}개) 최소 20개 필요.` };
    }
    const [A, B] = P;

    // ---- 먼저 연락 비율 (3h+ 침묵 후 첫 발화자) ----
    const firstContact = { [A]: 0, [B]: 0 };
    for (let i = 0; i < msgs.length; i++) {
      if (i === 0 || msgs[i].ts - msgs[i - 1].ts >= GAP_FIRST) firstContact[msgs[i].sender]++;
    }
    const fcTotal = firstContact[A] + firstContact[B] || 1;
    const fcShareA = firstContact[A] / fcTotal;
    const balance = Math.abs(fcShareA - 0.5) * 2;        // 0=균형, 1=완전 한쪽

    // ---- 답장속도 초기 vs 최근 (양쪽 합쳐서 관계 전체) ----
    const { early, recent } = slice(msgs, 0.25);
    const earlyReply = avg([...replyStats(early, A), ...replyStats(early, B)]);
    const recentReply = avg([...replyStats(recent, A), ...replyStats(recent, B)]);
    const replyRatio = earlyReply > 0 ? recentReply / earlyReply : 1;   // >1 = 느려짐
    const s_reply = clamp01(Math.log2(Math.max(replyRatio, 0.25)) / 4); // 16배 느려지면 1.0

    // ---- ㅋㅋ 길이 초기 vs 최근 ----
    const earlyLaugh = avg(early.map(m => laughRun(m.text)).filter(x => x > 0));
    const recentLaugh = avg(recent.map(m => laughRun(m.text)).filter(x => x > 0));
    const laughDrop = earlyLaugh > 0 ? clamp01(1 - recentLaugh / earlyLaugh) : 0;

    // ---- 메시지 빈도 (하루 평균) 초기 vs 최근 ----
    const perDay = (arr) => {
      const days = new Set(arr.map(m => m.date)).size || 1;
      return arr.length / days;
    };
    const earlyFreq = perDay(early), recentFreq = perDay(recent);
    const freqDrop = earlyFreq > 0 ? clamp01(1 - recentFreq / earlyFreq) : 0;

    // ---- 잘자 인사 빈도 초기 vs 최근 ----
    const nightRate = (arr) => arr.filter(m => NIGHT_RE.test(m.text)).length / (new Set(arr.map(m => m.date)).size || 1);
    const earlyNight = nightRate(early), recentNight = nightRate(recent);
    const nightDrop = earlyNight > 0 ? clamp01(1 - recentNight / earlyNight) : 0;

    // ---- 애정온도 = cooling 복합점수 (높을수록 식음) ----
    const W = { reply: .30, balance: .25, freq: .20, laugh: .15, night: .10 };
    const cooling = Math.round(
      (W.reply * s_reply + W.balance * balance + W.freq * freqDrop +
       W.laugh * laughDrop + W.night * nightDrop) * 100
    );
    const temp = 100 - cooling; // 애정온도: 높을수록 맑음

    // ---- 월별 온기 추세 (warmth, 높을수록 따뜻 — 차트용) ----
    const byMonth = {};
    for (const m of msgs) {
      const k = m.date.slice(0, 7);                       // YYYY-MM
      (byMonth[k] = byMonth[k] || []).push(m);
    }
    const months = Object.keys(byMonth).sort();
    const trend = months.map(k => {
      const arr = byMonth[k];
      const rep = avg([...replyStats(arr, A), ...replyStats(arr, B)]);
      const repScore = rep > 0 ? clamp01(1 - Math.log2(Math.max(rep / (1000 * 60 * 5), 1)) / 6) : 1; // 5분 기준
      const freqScore = clamp01(perDay(arr) / Math.max(earlyFreq, 1));
      const laughScore = clamp01(avg(arr.map(m => laughRun(m.text)).filter(x => x > 0)) / Math.max(earlyLaugh, 1));
      const warmth = Math.round((repScore * .4 + freqScore * .4 + laughScore * .2) * 100);
      return { month: k, warmth };
    });

    // ---- 날씨 메타포 (하트 금지, 날씨로) ----
    let wx, alert, state;
    if (temp > 75) { wx = "☀️"; alert = "맑음 · 안정권"; state = "따뜻함"; }
    else if (temp > 50) { wx = "⛅"; alert = "구름 조금 · 양호"; state = "미지근"; }
    else if (temp > 30) { wx = "🌧️"; alert = "비 · 식는 중"; state = "식는 중"; }
    else { wx = "🌨️"; alert = "⚠ 한파주의보 · 권태기 진입"; state = "한파"; }

    // 지난달 대비 온기 변화 → 온도(식음) 변화로 환산
    let deltaTxt = "";
    if (trend.length >= 2) {
      const d = trend[trend.length - 2].warmth - trend[trend.length - 1].warmth; // 온기 하락폭
      deltaTxt = d > 0 ? `지난달 대비 +${d}% 식음` : d < 0 ? `지난달 대비 ${d}% 회복` : "지난달과 비슷";
    }

    // ---- 신호 행 ----
    const signals = [
      { ic: "⏱", t: "답장 속도", sub: `초기 ${fmtDur(earlyReply)} → 최근 ${fmtDur(recentReply)}`,
        v: replyRatio >= 1.2 ? `${replyRatio.toFixed(1)}배 느림` : replyRatio <= 0.8 ? `${(1/replyRatio).toFixed(1)}배 빠름` : "비슷", down: replyRatio >= 1.2 },
      { ic: "📨", t: "먼저 연락 비율", sub: `${A} ${Math.round(fcShareA*100)}% · ${B} ${Math.round((1-fcShareA)*100)}%`,
        v: balance >= 0.4 ? "기울어짐" : "균형", down: balance >= 0.4 },
      { ic: "😂", t: '"ㅋㅋㅋ" 길이', sub: `평균 ${earlyLaugh.toFixed(1)}자 → ${recentLaugh.toFixed(1)}자`,
        v: laughDrop >= 0.2 ? `${Math.round(laughDrop*100)}% ↓` : "유지", down: laughDrop >= 0.2 },
      { ic: "🌃", t: "잘자 인사", sub: earlyNight > 0 ? "초기 있었음 → 최근 추세" : "거의 없음",
        v: nightDrop >= 0.3 ? "사라지는 중" : earlyNight > 0 ? "유지" : "—", down: nightDrop >= 0.3 },
    ];

    // 가장 두드러진 위험 신호 (예보 문구·페르소나 재료)
    const worst = [
      { k: "답장 지연", v: s_reply }, { k: "먼저연락 불균형", v: balance },
      { k: "대화량 감소", v: freqDrop }, { k: "웃음 감소", v: laughDrop },
    ].sort((a, b) => b.v - a.v);
    const band = temp <= 30 ? "cold" : temp <= 50 ? "cool" : "warm";

    // ---- 유료 잠금 티저 (실제 카운트로 미끼) ----
    const fightHits = msgs.filter(m => FIGHT_RE.test(m.text)).length;
    const heartHits = msgs.filter(m => HEART_RE.test(m.text)).length;

    const result = {
      temp, wx, alert, state, deltaTxt, band, worst,
      pair: { a: A, b: B },
      trend, signals,
      locked: { fightHits, heartHits },
      meta: { count: msgs.length, range: parsed.range },
    };
    Object.assign(result, flavor(result));   // 기본 persona/verdict 채움
    return result;
  }

  // ---- 페르소나·예보 문구 변형 (온도/추세는 고정, 코멘트만 매번 다르게) ----
  const PERSONA = {
    warm: ["☀️ 화창한 핑퐁 커플", "☀️ 안정권 라뷰버드", "🌤 잔잔하게 오래갈 커플", "☀️ 권태 무풍지대"],
    cool: ["⛅ 미지근 권태 진입러", "⛅ 츤데레 핑퐁", "🌥 식는 듯 마는 듯 커플", "⛅ 노력 필요 구간"],
    cold: ["🌨️ 한파 외사랑 모드", "🌨️ 권태기 정점 커플", "❄️ 일방통행 시그널", "🌨️ 적신호 점등 커플"],
  };
  const VERDICT = {
    warm: [
      (w, s) => `큰 위험 신호 없음. <b>${s}</b> 상태 유지 중. 흐름 나쁘지 않음.`,
      (w, s) => `안정권. <b>${w[0].k}</b>만 살짝 보이지만 걱정할 수준 아님.`,
      (w, s) => `지금 페이스 좋음. 이대로만 가도 <b>${s}</b> 유지.`,
    ],
    cool: [
      (w, s) => `<b>${w[0].k}</b> 신호가 두드러짐. 아직 회복 가능 구간. 먼저 연락·빈도 회복이 키.`,
      (w, s) => `<b>${w[0].k}</b>가 슬슬 보임. 지금 한 번 표현하면 반등 각.`,
      (w, s) => `<b>${w[0].k}</b>·<b>${w[1].k}</b> 주의. 골든타임은 아직 안 지남.`,
    ],
    cold: [
      (w, s) => `<b>${w[0].k}</b>·<b>${w[1].k}</b> 동시 악화. 이런 패턴은 <b>6~8주 내 갈등 폭발</b> 확률 높음. 지금이 대화 타이밍.`,
      (w, s) => `<b>${w[0].k}</b> 적신호. 방치하면 자연 소멸 코스. 솔직한 대화 필요.`,
      (w, s) => `<b>${w[0].k}</b>·<b>${w[1].k}</b> 빨간불. 마지막 회복 구간일 수 있음.`,
    ],
  };
  function flavor(result, rng) {
    rng = rng || Math.random;
    const b = result.band, pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const persona = pick(PERSONA[b]);
    const verdict = pick(VERDICT[b])(result.worst, result.state);
    return { persona, verdict };
  }

  // ---- 1:1 샘플 (6개월에 걸쳐 뜨겁→식음, 검증 가능하게 설계) ----
  function sample() {
    const L = [];
    L.push("나 님과 카카오톡 대화");
    L.push("저장한 날짜 : 2026-06-10 22:00:00");
    L.push("");
    const A = "나", B = "♥서연♥";
    // month, day별로 메시지 push. 초기엔 빠른답장·긴ㅋ·잘자, 후기엔 느림·짧은ㅋ·일방.
    const WDK = ["일","월","화","수","목","금","토"];
    const sep = (y, mo, d) => {
      const wd = WDK[new Date(y, mo - 1, d).getDay()];
      L.push(`--------------- ${y}년 ${mo}월 ${d}일 ${wd}요일 ---------------`);
    };
    const add = (ap, h, m, name, txt) =>
      L.push(`[${name}] [${ap} ${h}:${String(m).padStart(2,"0")}] ${txt}`);

    // 1월 — 불타는 초기 (빠른 답장, 긴 ㅋ, 잘자, 하트)
    sep(2026, 1, 10);
    add("오후",8,0,A,"자기야 뭐해 ㅋㅋㅋㅋㅋ");
    add("오후",8,2,B,"보고싶어서 연락했지 ㅋㅋㅋㅋㅋ 사랑해");
    add("오후",8,3,A,"나두 보고싶어 ㅠㅠ 내일 볼까");
    add("오후",8,4,B,"완전 좋아 ㅋㅋㅋㅋ");
    add("오후",11,55,A,"잘자 자기야 좋은 꿈 꿔");
    add("오후",11,57,B,"잘자 사랑해 ❤");
    sep(2026, 1, 22);
    add("오후",9,0,A,"오늘 데이트 너무 좋았어 ㅋㅋㅋㅋㅋ");
    add("오후",9,1,B,"그니까 ㅋㅋㅋㅋ 다음에 또 가자 보고싶다 벌써");
    add("오후",11,50,A,"잘자 굿나잇");
    add("오후",11,52,B,"굿나잇 ❤");

    // 2월 — 여전히 따뜻하나 살짝 둔화
    sep(2026, 2, 14);
    add("오후",7,0,A,"발렌타인데이 ㅋㅋㅋ 선물 준비했지");
    add("오후",7,6,B,"헐 진짜? ㅋㅋㅋ 고마워 사랑해");
    add("오후",11,40,A,"잘자");
    add("오후",11,48,B,"굿나잇");

    // 3월 — 답장 느려짐, ㅋ 짧아짐
    sep(2026, 3, 12);
    add("오후",8,0,A,"자기 뭐해?");
    add("오후",9,10,B,"어 일하는 중 ㅋㅋ");          // 1시간+
    add("오후",9,12,A,"바쁘구나 ㅠㅠ 이따 통화할까");
    add("오후",10,30,B,"오늘은 피곤해서 ㅠ 담에");

    // 4월 — 먼저연락 거의 A, 답장 더 느림
    sep(2026, 4, 8);
    add("오후",7,0,A,"오늘 하루 어땠어");
    add("오후",9,40,B,"그냥 그랬어");                  // 2시간40
    sep(2026, 4, 21);
    add("오후",8,0,A,"우리 주말에 볼까?");
    add("오후",11,20,B,"음 봐서");                     // 3시간+, 미지근

    // 5월 — 일방적, 짧은 답
    sep(2026, 5, 9);
    add("오후",7,30,A,"자기야");
    add("오후",7,32,A,"바빠?");
    add("오후",10,15,B,"ㅇㅇ");                        // 단답
    sep(2026, 5, 25);
    add("오후",8,0,A,"요즘 연락이 뜸하네 ㅠㅠ");
    add("오후",11,50,B,"미안 정신없었어");

    // 6월 — 한파. A만 먼저, B 단답·느림, 잘자 없음, 갈등 키워드
    sep(2026, 6, 3);
    add("오후",9,0,A,"우리 얘기 좀 해");
    add("오후",11,40,B,"지금은 좀");                   // 2시간40
    sep(2026, 6, 9);
    add("오후",8,0,A,"자기야 요즘 왜 그래");
    add("오후",8,1,A,"할말 있으면 해줘");
    add("오후",10,30,B,"나중에 얘기하자");             // 2시간+
    sep(2026, 6, 10);
    add("오후",9,0,A,"오늘은 통화 될까?");
    add("오후",11,55,B,"피곤해 ㅠ 담에");             // 2시간55, 잘자 없음

    return L.join("\n");
  }

  global.BreakupStats = { analyze, flavor, sample };
})(typeof window !== "undefined" ? window : globalThis);

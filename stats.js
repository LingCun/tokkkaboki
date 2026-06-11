// stats.js — 파싱된 메시지 → 빌런 리포트. 카탈로그 18종 + 매번 다른 조합.
// analyze(parsed) = 데이터에서 모든 후보 상 계산(결정적).
// select(analysis, opts) = 그 풀에서 노출할 상 N개 뽑기 (하이브리드: 센 상 고정 + 랜덤 로테이션).
//   → 같은 방도 🎲 재추첨하면 다른 상 조합. HTML이 select만 다시 호출.
// HONEST: 카톡 .txt엔 '읽음' 데이터 없음. 읽씹/먹튀/영업 등은 키워드·속도 기반 추정(재미용).

(function (global) {
  "use strict";

  const PAY_RE = /(쏠게|쏜다|한턱|내가\s*낼|내가\s*살게|계산할게|기프티콘|쏠께)/;
  const SALES_RE = /(좋은\s*기회|디엠|dm|투자|부업|코인|적금|보험|좋은\s*정보|돈\s*벌)/i;
  const Q_RE = /(\?|뭐해|왜\s|어디|언제|누구|어때|할까|갈까|먹을까|진짜\?|실화)/;

  const fmtDur = (ms) => {
    if (!isFinite(ms) || ms <= 0) return "—";
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}분`;
    const h = Math.floor(min / 60), mm = min % 60;
    if (h < 24) return mm ? `${h}시간 ${mm}분` : `${h}시간`;
    return `${Math.round(h / 24)}일`;
  };
  const laughRun = (t) => {
    const m = t.match(/[ㅋㅎ]{2,}/g);
    return m ? m.reduce((s, x) => s + x.length, 0) : 0;
  };

  // ---- 1단계: 데이터에서 모든 지표 + 후보 상 계산 ----
  function analyze(parsed) {
    const { messages: msgs, participants: P } = parsed;
    const N = msgs.length;
    const z = () => { const o = {}; for (const n of P) o[n] = 0; return o; };

    const M = {
      P, N,
      count: z(), night: z(), morning: z(), pay: z(), sales: z(),
      silence: z(), question: z(), laugh: z(), exclaim: z(),
      firstContact: z(), maxRun: z(), photo: z(), emoticon: z(),
      lenSum: z(), lenCnt: z(), shortCnt: z(),
    };
    const replyTimes = {}; for (const n of P) replyTimes[n] = [];
    const lastTs = {};
    const hourHist = new Array(24).fill(0);
    const wdHist = new Array(7).fill(0);
    const words = {};
    let maxLaughRun = 0, prev = null, runSender = null, runLen = 0;

    for (let i = 0; i < N; i++) {
      const m = msgs[i], s = m.sender, t = m.text;
      M.count[s]++;
      hourHist[m.hour]++; wdHist[m.weekday]++;
      if (m.hour >= 0 && m.hour < 5) M.night[s]++;
      if (m.hour >= 5 && m.hour < 9) M.morning[s]++;
      if (PAY_RE.test(t)) M.pay[s]++;
      if (SALES_RE.test(t)) M.sales[s]++;
      if (Q_RE.test(t)) M.question[s]++;
      M.exclaim[s] += (t.match(/!/g) || []).length;
      const lr = laughRun(t); M.laugh[s] += lr; if (lr > maxLaughRun) maxLaughRun = lr;

      if (m.isMedia) {
        if (/^사진/.test(t.trim())) M.photo[s]++;
        if (/^이모티콘/.test(t.trim())) M.emoticon[s]++;
      } else {
        const L = t.trim().length;
        M.lenSum[s] += L; M.lenCnt[s]++;
        if (L <= 3) M.shortCnt[s]++;
        for (const w of t.split(/\s+/)) { const k = w.trim(); if (k.length >= 1 && k.length <= 12) words[k] = (words[k] || 0) + 1; }
      }

      // 먼저 연락 (3h+ 침묵 후)
      if (i === 0 || m.ts - msgs[i - 1].ts >= 1000 * 60 * 60 * 3) M.firstContact[s]++;
      // 답장 지연 프록시
      if (prev && prev.sender !== s) { const dt = m.ts - prev.ts; if (dt >= 0 && dt < 1000 * 60 * 60 * 4) replyTimes[s].push(dt); }
      // 잠수(자기 연속 발화 최대 간격)
      if (lastTs[s] != null) M.silence[s] = Math.max(M.silence[s], m.ts - lastTs[s]);
      lastTs[s] = m.ts;
      // 연속 도배 streak
      if (s === runSender) runLen++; else { runSender = s; runLen = 1; }
      if (runLen > M.maxRun[s]) M.maxRun[s] = runLen;
      prev = m;
    }

    const avgReply = z(), avgLen = z(), shortRatio = z();
    for (const n of P) {
      const a = replyTimes[n];
      avgReply[n] = a.length ? a.reduce((x, y) => x + y, 0) / a.length : Infinity;
      avgLen[n] = M.lenCnt[n] ? M.lenSum[n] / M.lenCnt[n] : 0;
      shortRatio[n] = M.count[n] ? M.shortCnt[n] / M.count[n] : 0;
    }
    M.avgReply = avgReply; M.avgLen = avgLen; M.shortRatio = shortRatio;

    const pct = (n) => Math.round(M.count[n] / N * 100);

    // ---- 후보 상 정의 (eligible = 데이터 근거 있을 때만 후보) ----
    const DEFS = [
      { key: "도배왕", emoji: "📢", dir: "max", val: n => M.count[n], elig: () => true,
        fmt: (n) => ({ desc: `전체의 ${pct(n)}%를 혼자 작성`, stat: M.count[n], statLabel: "메시지" }) },
      { key: "읽씹왕", emoji: "👻", dir: "max", val: n => avgReply[n], elig: n => isFinite(avgReply[n]),
        fmt: (n) => ({ desc: `평균 답장 ${fmtDur(avgReply[n])} · 읽씹 의심`, stat: fmtDur(avgReply[n]), statLabel: "평균답장" }) },
      { key: "칼답왕", emoji: "⚡", dir: "min", val: n => avgReply[n], elig: n => isFinite(avgReply[n]) && avgReply[n] > 0,
        fmt: (n) => ({ desc: `평균 ${fmtDur(avgReply[n])} 만에 답장. 폰 붙어삶`, stat: fmtDur(avgReply[n]), statLabel: "평균답장" }) },
      { key: "잠수왕", emoji: "🤿", dir: "max", val: n => M.silence[n], elig: n => M.silence[n] > 0,
        fmt: (n) => ({ desc: `최장 ${fmtDur(M.silence[n])} 잠수 탐`, stat: fmtDur(M.silence[n]), statLabel: "최장잠수" }) },
      { key: "새벽감성러", emoji: "🌙", dir: "max", val: n => M.night[n], elig: n => M.night[n] > 0,
        fmt: (n) => ({ desc: `새벽 0~5시 메시지 ${M.night[n]}회`, stat: M.night[n], statLabel: "새벽톡" }) },
      { key: "아침형인간", emoji: "🐓", dir: "max", val: n => M.morning[n], elig: n => M.morning[n] > 0,
        fmt: (n) => ({ desc: `아침 5~9시에 ${M.morning[n]}회. 부지런`, stat: M.morning[n], statLabel: "아침톡" }) },
      { key: "ATM (먹튀 의혹)", emoji: "🏧", dir: "min", val: n => M.pay[n], elig: () => P.length >= 3 && Math.max(...P.map(n => M.pay[n])) > 0,
        fmt: (n) => ({ desc: `"쏠게/계산" 언급 ${M.pay[n]}회. 지갑 안 엶`, stat: M.pay[n], statLabel: "쏜 횟수" }) },
      { key: "영업왕 (수상함)", emoji: "🤖", dir: "max", val: n => M.sales[n], elig: n => M.sales[n] > 0,
        fmt: (n) => ({ desc: `"기회/디엠/투자" ${M.sales[n]}회 → 거리두기 각`, stat: M.sales[n], statLabel: "권유" }) },
      { key: "궁금왕", emoji: "❓", dir: "max", val: n => M.question[n], elig: n => M.question[n] >= 3,
        fmt: (n) => ({ desc: `질문·물음표 ${M.question[n]}회. 호기심 폭발`, stat: M.question[n], statLabel: "질문" }) },
      { key: "리액션부자", emoji: "😆", dir: "max", val: n => M.laugh[n], elig: n => M.laugh[n] > 0,
        fmt: (n) => ({ desc: `ㅋ·ㅎ 총 ${M.laugh[n]}자. 웃음 담당`, stat: M.laugh[n], statLabel: "ㅋㅎ" }) },
      { key: "느낌표중독", emoji: "❗", dir: "max", val: n => M.exclaim[n], elig: n => M.exclaim[n] >= 3,
        fmt: (n) => ({ desc: `느낌표 ${M.exclaim[n]}개!! 텐션 최고조`, stat: M.exclaim[n], statLabel: "!" }) },
      { key: "핵인싸", emoji: "🎤", dir: "max", val: n => M.firstContact[n], elig: n => M.firstContact[n] >= 2,
        fmt: (n) => ({ desc: `대화 ${M.firstContact[n]}번 먼저 시작. 분위기 메이커`, stat: M.firstContact[n], statLabel: "먼저톡" }) },
      { key: "투명인간", emoji: "👤", dir: "min", val: n => M.count[n], elig: () => P.length >= 3,
        fmt: (n) => ({ desc: `전체의 ${pct(n)}%만 발언. 조용함`, stat: M.count[n], statLabel: "메시지" }) },
      { key: "폭주기관차", emoji: "🚂", dir: "max", val: n => M.maxRun[n], elig: n => M.maxRun[n] >= 3,
        fmt: (n) => ({ desc: `쉬지 않고 ${M.maxRun[n]}연속 도배`, stat: M.maxRun[n], statLabel: "연속" }) },
      { key: "단답왕", emoji: "🥶", dir: "max", val: n => shortRatio[n], elig: n => M.count[n] >= 5 && shortRatio[n] >= 0.4,
        fmt: (n) => ({ desc: `${Math.round(shortRatio[n] * 100)}%가 단답(ㅇㅇ/ㅋ). 영혼 없음`, stat: `${Math.round(shortRatio[n] * 100)}%`, statLabel: "단답률" }) },
      { key: "장문왕", emoji: "📜", dir: "max", val: n => avgLen[n], elig: n => avgLen[n] >= 20,
        fmt: (n) => ({ desc: `평균 ${Math.round(avgLen[n])}자. 소설 씀`, stat: Math.round(avgLen[n]), statLabel: "평균글자" }) },
      { key: "사진왕", emoji: "📸", dir: "max", val: n => M.photo[n], elig: n => M.photo[n] > 0,
        fmt: (n) => ({ desc: `사진 ${M.photo[n]}장 투척. 갤러리 공유`, stat: M.photo[n], statLabel: "사진" }) },
      { key: "이모티콘왕", emoji: "🎨", dir: "max", val: n => M.emoticon[n], elig: n => M.emoticon[n] > 0,
        fmt: (n) => ({ desc: `이모티콘 ${M.emoticon[n]}개. 말보다 그림`, stat: M.emoticon[n], statLabel: "이모티콘" }) },
    ];

    // 각 def → eligible 인원 점수화(0~1, 얼마나 극단적인가) + 랭킹
    const pool = [];
    for (const d of DEFS) {
      const elig = P.filter(n => d.elig(n));
      if (!elig.length) continue;
      const vals = elig.map(d.val);
      const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
      const ranked = elig.map(n => {
        const v = d.val(n);
        const score = d.dir === "max" ? (v - mn) / span : (mx - v) / span;
        return { person: n, value: v, score };
      }).sort((a, b) => b.score - a.score || (d.dir === "max" ? b.value - a.value : a.value - b.value));
      // strength = 선택 가중치. 변별력(spread) 높을수록↑, 단독 자격자도 바닥 0.35 보장.
      const strength = 0.35 + 0.65 * ranked[0].score;
      pool.push({ key: d.key, emoji: d.emoji, fmt: d.fmt, ranked, strength });
    }

    // ---- 하단 칩(스트립) 후보 풀 ----
    const topWords = Object.entries(words).sort((a, b) => b[1] - a[1]).filter(([w]) => w.length >= 2).slice(0, 1);
    const topWord = topWords[0] || Object.entries(words).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
    const busiestHour = hourHist.indexOf(Math.max(...hourHist));
    const busiestWd = wdHist.indexOf(Math.max(...wdHist));
    const WD = global.KakaoParser ? global.KakaoParser.WD : ["일","월","화","수","목","금","토"];
    const days = new Set(msgs.map(m => m.date)).size;
    const totalNight = P.reduce((s, n) => s + M.night[n], 0);
    const totalPhoto = P.reduce((s, n) => s + M.photo[n], 0);
    const stripPool = [
      { v: `${String(busiestHour).padStart(2,"0")}:00대`, label: "가장 활발한 시간" },
      { v: topWord[0], label: `최다 단어 (${topWord[1]}회)` },
      { v: `${WD[busiestWd]}요일`, label: "제일 시끄러운 요일" },
      { v: N.toLocaleString(), label: "총 메시지" },
      { v: `${days}일`, label: "대화한 날" },
      { v: `${maxLaughRun}연타`, label: "최장 ㅋㅋㅋ" },
      totalNight > 0 ? { v: `${totalNight}회`, label: "새벽 메시지 총합" } : null,
      totalPhoto > 0 ? { v: `${totalPhoto}장`, label: "주고받은 사진" } : null,
    ].filter(Boolean);

    return { pool, stripPool, meta: { count: N, participants: P, range: parsed.range, isGroup: parsed.isGroup } };
  }

  // ---- 2단계: 풀에서 노출할 상 뽑기 (하이브리드) ----
  // fixed개는 가장 센 상 결정적 고정, 나머지는 점수 가중 랜덤 로테이션. 1인 1관왕.
  function select(analysis, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const P = analysis.meta.participants;
    const total = Math.min(opts.total || 6, P.length, analysis.pool.length);
    const fixed = Math.min(opts.fixed != null ? opts.fixed : 2, total);

    const avail = analysis.pool.slice().sort((a, b) => b.strength - a.strength);
    const taken = new Set(), out = [];
    const assign = (award) => {
      const r = award.ranked.find(x => !taken.has(x.person));
      if (!r) return false;
      taken.add(r.person);
      out.push(Object.assign({ key: award.key, emoji: award.emoji, person: r.person }, award.fmt(r.person)));
      return true;
    };

    let i = 0;
    for (; i < avail.length && out.length < fixed; i++) assign(avail[i]);
    const rest = avail.slice(i);
    while (out.length < total && rest.length) {
      const w = rest.map(a => Math.max(0.02, a.strength));
      const sum = w.reduce((x, y) => x + y, 0);
      let r = rng() * sum, idx = 0;
      while (idx < w.length - 1 && r > w[idx]) { r -= w[idx]; idx++; }
      const [pick] = rest.splice(idx, 1);
      assign(pick);
    }

    // 스트립 3개 랜덤
    const sp = analysis.stripPool.slice();
    const strip = [];
    while (strip.length < 3 && sp.length) strip.push(sp.splice(Math.floor(rng() * sp.length), 1)[0]);

    return { awards: out, strip, meta: analysis.meta };
  }

  global.KakaoStats = { analyze, select };
})(typeof window !== "undefined" ? window : globalThis);

// parser.js — KakaoTalk .txt export parser (client-side, no server)
// Supports PC / Android / iOS export formats + multi-line messages.

(function (global) {
  "use strict";

  // ---- line patterns ----
  // PC date separator:  --------------- 2026년 6월 9일 화요일 ---------------
  const RE_DATESEP = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{3,}\s*$/;
  // PC message:  [홍길동] [오후 11:32] 내용
  const RE_PC = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*([\s\S]*)$/;
  // Android:  2026년 6월 9일 오후 11:32, 홍길동 : 내용
  const RE_AND = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*([\s\S]*)$/;
  // iOS:  2026. 6. 9. 오후 11:32, 홍길동 : 내용
  const RE_IOS = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*([\s\S]*)$/;

  // system / noise lines to drop
  const RE_NOISE = /(저장한 날짜|카카오톡 대화|운영정책|님이 (들어왔|나갔)습니다|채팅방 관리자가)/;

  function to24h(ampm, h, m) {
    h = parseInt(h, 10); m = parseInt(m, 10);
    if (ampm === "오전") { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return { h, m };
  }

  function push(messages, cur) {
    if (cur) { cur.text = cur.text.replace(/\s+$/, ""); messages.push(cur); }
  }

  // main parse
  function parseKakao(raw) {
    const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
    const messages = [];
    let curDate = null;          // {y,mo,d} from last PC date separator
    let cur = null;              // message being built (for multiline)

    for (const line of lines) {
      if (line.trim() === "") continue;

      const ds = RE_DATESEP.exec(line);
      if (ds) {
        curDate = { y: +ds[1], mo: +ds[2], d: +ds[3] };
        continue;
      }

      let m, sender, text, y, mo, d, hh, mm;

      if ((m = RE_PC.exec(line))) {
        if (!curDate) continue;             // PC msg needs a date context
        const t = to24h(m[2], m[3], m[4]);
        sender = m[1]; text = m[5];
        y = curDate.y; mo = curDate.mo; d = curDate.d; hh = t.h; mm = t.m;
      } else if ((m = RE_AND.exec(line)) || (m = RE_IOS.exec(line))) {
        const t = to24h(m[4], m[5], m[6]);
        y = +m[1]; mo = +m[2]; d = +m[3]; hh = t.h; mm = t.m;
        sender = m[7]; text = m[8];
      } else {
        // continuation line of previous message (multiline)
        if (cur) cur.text += "\n" + line;
        continue;
      }

      if (RE_NOISE.test(line)) { push(messages, cur); cur = null; continue; }

      push(messages, cur);
      const dt = new Date(y, mo - 1, d, hh, mm);
      cur = {
        sender: sender.trim(),
        text: text,
        dt: dt,
        ts: dt.getTime(),
        hour: hh,
        weekday: dt.getDay(),            // 0=일 .. 6=토
        date: `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`,
        isMedia: /^(사진|동영상|이모티콘|음성메시지|파일:)/.test(text.trim()),
      };
    }
    push(messages, cur);

    const participants = [...new Set(messages.map(x => x.sender))];
    return {
      messages,
      participants,
      count: messages.length,
      isGroup: participants.length > 2,
      range: messages.length
        ? { from: messages[0].date, to: messages[messages.length - 1].date }
        : null,
    };
  }

  // ---- fake sample generator (for testing without real data) ----
  const WD = ["일","월","화","수","목","금","토"];
  function sample() {
    // PC-format export with clear "villains" baked in so stats are verifiable.
    const L = [];
    L.push("퇴근하고싶다 님과 카카오톡 대화");
    L.push("저장한 날짜 : 2026-06-10 15:30:01");
    L.push("");
    L.push("--------------- 2026년 6월 9일 화요일 ---------------");
    const add = (ap, h, m, name, txt) => L.push(`[${name}] [${ap} ${h}:${String(m).padStart(2,"0")}] ${txt}`);
    // 강하준 = 도배왕(메시지 폭탄), 김민준 = 느린 답장, 박도윤 = 새벽, 정유나 = 영업
    add("오후",2,5,"강하준","ㅋㅋㅋㅋㅋ 점심 뭐 먹음");
    add("오후",2,5,"강하준","나 김밥 먹음");
    add("오후",2,5,"강하준","존맛탱");
    add("오후",2,6,"이서연","난 굶음");
    add("오후",2,7,"강하준","왜?? 밥 챙겨먹어");
    add("오후",2,8,"강하준","ㅠㅠㅠㅠ");
    add("오후",2,30,"강하준","담주에 모임 ㄱㄱ?");
    add("오후",6,12,"김민준","ㅇㅋ");                 // 4시간 뒤 답 → 느림보
    add("오후",6,13,"정유나","얘들아 나 좋은 기회 있어서 디엠 줄게 투자");
    add("오후",6,14,"이서연","또 시작이네");
    L.push("--------------- 2026년 6월 10일 수요일 ---------------");
    add("오전",3,12,"박도윤","자니");                 // 새벽
    add("오전",3,18,"박도윤","아 외롭다");
    add("오전",3,40,"박도윤","다들 자는구나");
    add("오후",11,2,"강하준","ㅋㅋㅋ 도윤이 또 새벽감성");
    add("오후",11,5,"강하준","담주 회비 내가 쏠게");
    add("오후",11,40,"김민준","ㅇㅇ");                 // 또 느린 답
    return L.join("\n");
  }

  global.KakaoParser = { parseKakao, sample, WD };
})(typeof window !== "undefined" ? window : globalThis);

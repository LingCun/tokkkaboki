// ad.js — 업로드 후 "분석 중" 동안 광고를 보여주는 게이트. (카카오 애드핏)
// AdGate.run(seconds, title) → Promise (분석중 카운트 끝나고 '결과 보기' 누르면 resolve).
//
// 실광고 켜는 법:
//   1) 카카오 애드핏(adfit.kakao.com) 가입 → 사이트 등록(배포 도메인) → 웹 배너 광고단위 생성
//   2) 발급된 광고단위 ID("DAN-xxxxxxxx")를 아래 ADFIT_UNIT 에 입력
//   3) HTTPS 실도메인에 배포 (file://·localhost 에선 광고 안 뜸)
//   ADFIT_UNIT 비어있으면 플레이스홀더가 대신 표시됨(로컬 목업).

(function (g) {
  "use strict";

  // ===== 광고 설정 =====
  const ADFIT_UNIT = "DAN-Z9CQiyXSqwOD4DKQ"; // 톡까보기 분석중 300x250
  const ADFIT_W = 300, ADFIT_H = 250; // 미디엄 렉탱글 (애드핏 지원 사이즈)
  // =====================

  const css = `
  .adgate{position:fixed;inset:0;background:rgba(5,6,10,.93);display:flex;align-items:center;
    justify-content:center;z-index:100;opacity:0;transition:opacity .2s;padding:22px;
    font-family:"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;}
  .adgate.on{opacity:1;}
  .ag-box{width:344px;max-width:100%;background:#12151d;border:1px solid #2a3040;border-radius:20px;padding:16px;
    box-shadow:0 24px 60px rgba(0,0,0,.5);}
  .ag-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
  .ag-tag{font-size:11px;font-weight:900;color:#cfd6e6;background:#2a3040;padding:5px 11px;border-radius:7px;letter-spacing:.04em;}
  .ag-cd{font-size:13px;font-weight:900;color:#9aa3b8;}
  .ag-ad{min-height:258px;border-radius:14px;background:linear-gradient(135deg,#1c2233,#141823);
    border:1px dashed #38415a;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;}
  .ag-ad-in{color:#7f879b;font-size:12px;line-height:1.8;padding:10px;}
  .ag-ad-in .e{font-size:40px;}
  .ag-ad-in b{display:block;font-size:16px;color:#cfd6e6;margin-top:6px;}
  .ag-note{font-size:11px;color:#7f879b;text-align:center;margin:12px 0;}
  .ag-btn{width:100%;padding:14px;border:0;border-radius:12px;font-size:14px;font-weight:900;
    background:#2a3040;color:#6b7488;cursor:not-allowed;transition:background .15s;}
  .ag-btn.ready{background:linear-gradient(90deg,#ffe600,#ffc400);color:#2a1d05;cursor:pointer;}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const placeholder = `<div class="ag-ad-in"><div class="e">📢</div><b>광고 자리</b>배포 + 애드핏 단위ID 입력 시 실광고 노출</div>`;

  // 애드핏 no-fill(광고 못 받음) → 플레이스홀더로 폴백
  g.adfitOnFail = function (el) {
    const box = el && el.closest ? el.closest(".ag-ad") : null;
    if (box) box.innerHTML = placeholder;
  };

  function adMarkup() {
    if (!ADFIT_UNIT) return placeholder;
    return `<ins class="kakao_ad_area" style="display:none;"
       data-ad-unit="${ADFIT_UNIT}" data-ad-width="${ADFIT_W}" data-ad-height="${ADFIT_H}"
       data-ad-onfail="adfitOnFail"></ins>`;
  }

  function loadAdfit(scope) {
    if (!ADFIT_UNIT) return;
    // 동적 삽입된 ins 를 렌더하려면 ba.min.js 를 (재)주입해 스캔 트리거
    const sc = document.createElement("script");
    sc.async = true; sc.charset = "utf-8";
    sc.src = "https://t1.kakaocdn.net/kas/static/ba.min.js";
    scope.appendChild(sc);
  }

  function run(seconds, title) {
    seconds = seconds || 10;
    title = title || "대화 분석 중";
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "adgate";
      ov.innerHTML = `
        <div class="ag-box">
          <div class="ag-top"><span class="ag-tag">🔍 ${title}…</span><span class="ag-cd" id="ag-cd">${seconds}</span></div>
          <div class="ag-ad">${adMarkup()}</div>
          <div class="ag-note">분석이 끝나는 동안 잠깐 광고가 나와요</div>
          <button class="ag-btn" id="ag-btn" disabled>분석 중… ${seconds}초</button>
        </div>`;
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("on"));
      loadAdfit(ov.querySelector(".ag-ad"));

      let left = seconds;
      const btn = ov.querySelector("#ag-btn"), cd = ov.querySelector("#ag-cd");
      const tick = setInterval(() => {
        left--; cd.textContent = Math.max(0, left);
        if (left <= 0) {
          clearInterval(tick);
          btn.disabled = false; btn.classList.add("ready"); btn.textContent = "결과 보기 →";
        } else { btn.textContent = `분석 중… ${left}초`; }
      }, 1000);

      btn.onclick = () => {
        if (btn.disabled) return;
        ov.classList.remove("on");
        setTimeout(() => ov.remove(), 200);
        resolve();
      };
    });
  }

  g.AdGate = { run };
})(window);

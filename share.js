// share.js — 결과를 카드 이미지로 만들어 공유. 외부 라이브러리 없이 Canvas로 직접 그림.
// (프라이버시 컨셉: 서버 없음 → 공유 링크 불가. 대신 이미지+캡션을 네이티브 공유시트/저장으로.)
// Share.villain(result, room) / Share.breakup(result) → 공유 실행.

(function (g) {
  "use strict";

  const FONT = '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const S = 2;                       // 레티나 스케일 → 1080x1350 출력
  const W = 540, H = 675;

  function newCanvas() {
    const cv = document.createElement("canvas");
    cv.width = W * S; cv.height = H * S;
    const c = cv.getContext("2d");
    c.scale(S, S);
    c.textBaseline = "top";
    return { cv, c };
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---- 빌런 리포트 카드 (노랑·바이럴) ----
  function drawVillain(result, room) {
    const { cv, c } = newCanvas();
    c.fillStyle = "#fffdf5"; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, 160);
    g.addColorStop(0, "#ffe600"); g.addColorStop(1, "#ffd000");
    c.fillStyle = g; c.fillRect(0, 0, W, 150);

    c.fillStyle = "#2a1d05"; c.font = `900 30px ${FONT}`;
    c.fillText("🏆 우리 단톡 빌런 리포트", 28, 32);
    c.fillStyle = "#6b5300"; c.font = `800 16px ${FONT}`;
    c.fillText(`💬 ${room} · 멤버 ${result.meta.participants.length}명`, 28, 80);
    c.fillStyle = "#8a7300"; c.font = `600 13px ${FONT}`;
    c.fillText(`분석 메시지 ${result.meta.count.toLocaleString()}개`, 28, 106);

    let y = 176;
    result.awards.slice(0, 5).forEach((a, i) => {
      const x = 24, w = W - 48, h = 82;
      rr(c, x, y, w, h, 16);
      c.fillStyle = i === 0 ? "#fff7e3" : "#ffffff"; c.fill();
      c.strokeStyle = i === 0 ? "#f3cf6b" : "#ece6d6"; c.lineWidth = 1.5; c.stroke();
      c.textBaseline = "middle"; c.font = "38px sans-serif"; c.fillStyle = "#000";
      c.fillText(a.emoji, x + 16, y + h / 2);
      c.textBaseline = "top";
      c.fillStyle = "#ff5a5f"; c.font = `800 14px ${FONT}`; c.fillText(a.key, x + 74, y + 16);
      c.fillStyle = "#1d1b16"; c.font = `900 23px ${FONT}`; c.fillText(a.person, x + 74, y + 37);
      c.textAlign = "right";
      c.fillStyle = "#2a1d05"; c.font = `900 22px ${FONT}`; c.fillText(String(a.stat), x + w - 18, y + 22);
      c.fillStyle = "#9c8a5a"; c.font = `700 11px ${FONT}`; c.fillText(a.statLabel, x + w - 18, y + 50);
      c.textAlign = "left";
      y += h + 11;
    });

    c.fillStyle = "#c2b9a6"; c.font = `700 13px ${FONT}`;
    c.fillText("※ 재미용 추정 · 카톡엔 '읽음' 데이터 없음", 28, H - 64);
    c.fillStyle = "#1d1b16"; c.font = `900 17px ${FONT}`;
    c.fillText("톡까보기", 28, H - 40);
    c.fillStyle = "#8a7300"; c.font = `700 13px ${FONT}`;
    c.fillText("· 카톡 .txt 하나로 우리 단톡 까기", 108, H - 37);
    return cv;
  }

  // ---- 연인 예보 카드 (보라·어두움) ----
  function drawBreakup(result) {
    const { cv, c } = newCanvas();
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#241a36"); bg.addColorStop(1, "#140d20");
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    c.textAlign = "center";
    c.fillStyle = "#b89bff"; c.font = `800 13px ${FONT}`;
    c.fillText("관계 일기예보", W / 2, 34);
    c.font = "72px sans-serif"; c.fillStyle = "#fff"; c.fillText(result.wx, W / 2, 56);
    c.fillStyle = "#ff8fb0"; c.font = `800 15px ${FONT}`; c.fillText(result.alert, W / 2, 142);
    c.fillStyle = "#e6d4ff"; c.font = `900 18px ${FONT}`; c.fillText(result.persona, W / 2, 172);

    // 온도 큰 숫자
    c.fillStyle = "#ff6a8a"; c.font = `900 78px ${FONT}`; c.fillText(`${result.temp}%`, W / 2, 210);
    c.fillStyle = "#b3a8c8"; c.font = `700 14px ${FONT}`; c.fillText(`${result.state}${result.deltaTxt ? " · " + result.deltaTxt : ""}`, W / 2, 300);

    // 온도바
    const bx = 40, bw = W - 80, by = 338;
    const barG = c.createLinearGradient(bx, 0, bx + bw, 0);
    barG.addColorStop(0, "#3ad07a"); barG.addColorStop(.45, "#f5c043"); barG.addColorStop(1, "#ff5a5f");
    rr(c, bx, by, bw, 9, 5); c.fillStyle = barG; c.fill();
    const kx = bx + bw * Math.min(98, Math.max(2, result.temp)) / 100;
    c.beginPath(); c.arc(kx, by + 4.5, 9, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill();
    c.lineWidth = 3; c.strokeStyle = "#ff5a5f"; c.stroke();

    // 신호 3개
    c.textAlign = "left";
    let y = 380;
    result.signals.slice(0, 3).forEach((s) => {
      c.textBaseline = "middle"; c.font = "24px sans-serif"; c.fillStyle = "#fff";
      c.fillText(s.ic, 40, y + 24);
      c.textBaseline = "top";
      c.fillStyle = "#f2ecfa"; c.font = `800 15px ${FONT}`; c.fillText(s.t, 82, y + 10);
      c.fillStyle = "#9a8fb5"; c.font = `600 12px ${FONT}`; c.fillText(s.sub, 82, y + 32);
      c.textAlign = "right"; c.fillStyle = s.down ? "#ff6a8a" : "#5fd08a"; c.font = `800 14px ${FONT}`;
      c.fillText(s.v + (s.down ? " ↓" : ""), W - 40, y + 18); c.textAlign = "left";
      y += 58;
    });

    c.fillStyle = "#6f6688"; c.font = `700 13px ${FONT}`;
    c.fillText("※ 애정온도는 답장속도·빈도 등 추정 (재미용)", 40, H - 62);
    c.fillStyle = "#c79bff"; c.font = `900 17px ${FONT}`; c.fillText("톡까보기", 40, H - 38);
    c.fillStyle = "#8a7fa6"; c.font = `700 13px ${FONT}`; c.fillText("· 연인 예보", 120, H - 35);
    return cv;
  }

  // ---- 공유 실행: 네이티브 공유시트(이미지 첨부) → 폴백 저장+캡션복사 ----
  async function shareCanvas(cv, caption, filename) {
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (!blob) { alert("이미지 생성 실패"); return; }
    const file = new File([blob], filename, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: caption }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }   // 사용자가 취소
    }
    // 폴백: PNG 다운로드 + 캡션 클립보드 복사
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    try { await navigator.clipboard.writeText(caption); } catch (e) {}
    alert("📤 결과 이미지를 저장했어요!\n단톡방·인스타에 붙여넣어 공유하세요. (캡션 복사됨)");
  }

  function villain(result, room) {
    const a0 = result.awards[0];
    const caption = `우리 단톡 빌런 시상식 🏆\n1위 ${a0 ? a0.key + " " + a0.person : ""} 😂\n나도 까보기 → 톡까보기 #톡까보기 #빌런리포트`;
    return shareCanvas(drawVillain(result, room || "내 단톡방"), caption, "tokkkaboki-villain.png");
  }
  function breakup(result) {
    const caption = `우리 애정온도 ${result.temp}% ${result.wx}\n${result.persona}\n#톡까보기 #연인예보`;
    return shareCanvas(drawBreakup(result), caption, "tokkkaboki-breakup.png");
  }

  g.Share = { villain, breakup };
})(window);

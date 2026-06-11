// upload.js — 카톡 내보내기 파일 읽기 헬퍼. KakaoUpload.read(file) → Promise<string>
// .txt는 그대로, .zip(아이폰 내보내기가 메일로 보내는 형식)은 안의 .txt를 자동 추출.
// 압축 해제까지 전부 브라우저 안에서 처리 — 서버 전송 없음 원칙 유지.
(function (g) {
  "use strict";

  const JSZIP_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  let zipLoading = null;

  function loadJSZip() {
    if (g.JSZip) return Promise.resolve(g.JSZip);
    if (zipLoading) return zipLoading;
    zipLoading = new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = JSZIP_SRC;
      sc.onload = () => res(g.JSZip);
      sc.onerror = () => { zipLoading = null; rej(new Error("압축 해제 모듈을 못 불러왔어요. 네트워크 확인 후 다시 시도해주세요.")); };
      document.head.appendChild(sc);
    });
    return zipLoading;
  }

  function readAsText(file) {
    return new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => res(String(rd.result || ""));
      rd.onerror = () => rej(new Error("파일을 읽지 못했어요. 다시 시도해주세요."));
      rd.readAsText(file, "utf-8");
    });
  }

  function isZip(file) {
    const name = (file.name || "").toLowerCase();
    return name.endsWith(".zip") ||
      file.type === "application/zip" || file.type === "application/x-zip-compressed";
  }

  async function read(file) {
    if (!file) throw new Error("파일이 없어요.");
    if (!isZip(file)) return readAsText(file);

    const JSZip = await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    zip.forEach((path, entry) => {
      if (!entry.dir && /\.txt$/i.test(path) && !path.startsWith("__MACOSX")) entries.push(entry);
    });
    if (!entries.length) throw new Error("ZIP 안에서 카톡 .txt를 못 찾았어요. 카톡 '대화 내보내기'로 받은 파일이 맞는지 확인해주세요.");
    // .txt가 여러 개면 가장 긴(=본문일 가능성 높은) 것 선택
    const texts = await Promise.all(entries.map(e => e.async("string")));
    let best = 0;
    for (let i = 1; i < texts.length; i++) if (texts[i].length > texts[best].length) best = i;
    return texts[best];
  }

  g.KakaoUpload = { read };
})(window);

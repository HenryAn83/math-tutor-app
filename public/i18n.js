// 화면 언어. 폰(브라우저) 언어가 한국어면 한국어, 아니면 영어. 언어 버튼으로 바꾸면 이 폰이 기억한다.
// 새 언어(예: 스페인어)를 넣으려면: 아래에 사전 하나 더 만들고 LANGS, NAMES, SPEECH에 한 줄씩 넣는다.
// 화면에 처음부터 적힌 한국어는 index.html에 그대로 있고, data-i18n 표시가 붙은 곳만 바꾼다.

export const LANGS = ["ko", "en"];
const NAMES = { ko: "한국어", en: "English" };
// 음성 인식/읽어 주기에 쓰는 말 코드
export const SPEECH = { ko: "ko-KR", en: "en-US" };

function detect() {
  try {
    const saved = localStorage.getItem("lang");
    if (LANGS.includes(saved)) return saved;
  } catch {}
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  for (const p of prefs) {
    const code = String(p).toLowerCase().split("-")[0];
    if (LANGS.includes(code)) return code;
  }
  return "en";
}

export const lang = detect();

const ko = {
  "app.name": "수학쌤",
  "err.network": "앗, 연결에 문제가 생겼어. 다시 해 볼래?",
  "wait.read": "사진 읽는 중…",
  "wait.readSub": "보통 10초쯤 걸려",
  "photo.bad": "이 사진은 열 수가 없어. 다른 사진으로 해 볼래?",
  "photo.none": "문제를 못 찾았어. 문제 하나만 크게 다시 찍어 줄래?",
  "figure.tag": "[그림]",
  "confirm.many": "문제가 여러 개 보여. 어떤 걸 할까?",
  "confirm.num": "{n}번",
  "confirm.title": "이렇게 읽었는데 맞아?",
  "confirm.unclear": "잘 안 보인 부분: {parts}. 틀렸으면 '고칠게'를 눌러 줘.",
  "confirm.figureRemoved": "그림은 빼고 할게. 선생님이 글로 설명해 줄게!",
  "confirm.typeTitle": "문제를 적어 줘",
  "confirm.empty": "문제를 먼저 적어 줘!",
  "wait.check": "선생님이 먼저 풀어 보는 중…",
  "wait.checkSub": "틀린 걸 알려 주면 안 되니까 두 번 풀어서 맞춰 볼게. 30초~1분쯤 걸려.",
  "chat.keyTitle": "핵심설명",
  "chat.keySpoken": "핵심 설명!",
  "chat.replay": "🔊 다시 듣기",
  "chat.stop": "⏹ 그만 듣기",
  "chat.soundOn": "소리 켰어!",
  "chat.listening": "듣고 있어… 말해 봐",
  "chat.ph": "생각을 적어 봐",
  "chat.newConfirm": "새 문제로 갈까? 지금까지 푼 과정은 '지난 문제'에 정리해 둘게.",
  "chat.verified": "✅ 확인됨",
  "chat.unverified": "⚠️ 같이 확인",
  "chat.figureHide": "그림 접기 ▲",
  "chat.figureShow": "그림 보기 ▼",
  "quick.hint": "힌트 좀 줘",
  "quick.dunno": "잘 모르겠어",
  "quick.again": "왜 그렇게 되는지 다시 설명해 줘",
  "quick.pick": "하나만 골라 줘! 아니면 '건너뛰기'",
  "quick.thanks": "고마워! 😊",
  "tut.next": "다음",
  "tut.start": "시작하기!",
  "code.wrong": "코드가 맞지 않아. 다시 확인해 줄래?",
  "login.lead": "아이디로 들어와 줘.",
  "login.leadSignup": "처음 왔구나! 아이디를 만들어 줘.",
  "login.submit": "들어가기",
  "login.submitSignup": "가입하고 시작",
  "login.toSignup": "처음이야? 가입하기",
  "login.toLogin": "이미 아이디가 있어? 로그인",
  "login.blank": "빈칸을 다 채워 줘!",
  "me.unlimited": "무제한",
  "me.credits": "남은 무료 문제 {n}개",
  "logout.confirm": "로그아웃할까?",
  "fb.about": "문제: {about}",
  "fb.empty": "한 줄이라도 적어 줄래?",
  "fb.thanks": "고마워! 잘 받았어 😊",
  "history.full": "폰 저장 공간이 부족해서 기록을 못 남겼어.",
  "history.button": "📚 지난 문제 {n}개",
  "history.summarizing": "정리 중…",
  "history.finished": "✅ 다 풀었어",
  "history.paused": "⏸ 풀다 멈춤",
  "history.delete": "지우기",
  "history.deleteConfirm": "이 기록을 지울까? 되돌릴 수 없어.",
  "note.noAnswer": "아직 못 풀었어",
  "date.today": "오늘 {time}",
  "date.day": "{m}월 {d}일 {time}",
  "voice.denied": "마이크를 쓸 수 있게 허용해 줘. (설정 → 브라우저 → 마이크)",
  "voice.silent": "소리가 안 들렸어. 🎤 누르고 다시 말해 줄래?",
  "voice.failed": "음성 인식이 잘 안 됐어. 글자로 써 줄래?",
  "figure.aria": "문제 그림",
};

const en = {
  "app.name": "Math Coach",
  "err.network": "Oops, something went wrong with the connection. Try again?",
  "wait.read": "Reading your photo…",
  "wait.readSub": "This usually takes about 10 seconds",
  "photo.bad": "I can't open this photo. Want to try a different one?",
  "photo.none": "I couldn't find a problem. Can you take a closer photo of just one problem?",
  "figure.tag": "[Figure]",
  "confirm.many": "I see more than one problem. Which one should we do?",
  "confirm.num": "#{n}",
  "confirm.title": "Did I read this right?",
  "confirm.unclear": "Hard to read: {parts}. If it's wrong, tap 'Fix it'.",
  "confirm.figureRemoved": "OK, we'll skip the drawing. I'll explain in words!",
  "confirm.typeTitle": "Type the problem",
  "confirm.empty": "Type the problem first!",
  "wait.check": "Your coach is solving it first…",
  "wait.checkSub": "I solve it twice to make sure I don't tell you anything wrong. About 30 seconds to 1 minute.",
  "chat.keyTitle": "Key idea",
  "chat.keySpoken": "Key idea!",
  "chat.replay": "🔊 Play again",
  "chat.stop": "⏹ Stop",
  "chat.soundOn": "Sound is on!",
  "chat.listening": "I'm listening… go ahead",
  "chat.ph": "Type your thinking",
  "chat.newConfirm": "Start a new problem? I'll save what you did so far in 'Past problems'.",
  "chat.verified": "✅ Checked",
  "chat.unverified": "⚠️ Let's check together",
  "chat.figureHide": "Hide drawing ▲",
  "chat.figureShow": "Show drawing ▼",
  "quick.hint": "Can I get a hint?",
  "quick.dunno": "I'm not sure",
  "quick.again": "Can you explain why again?",
  "quick.pick": "Pick at least one! Or tap 'Skip'",
  "quick.thanks": "Thanks! 😊",
  "tut.next": "Next",
  "tut.start": "Let's start!",
  "code.wrong": "That code doesn't match. Can you check it again?",
  "login.lead": "Log in with your username.",
  "login.leadSignup": "Welcome! Make a username.",
  "login.submit": "Log in",
  "login.submitSignup": "Sign up and start",
  "login.toSignup": "New here? Sign up",
  "login.toLogin": "Already have a username? Log in",
  "login.blank": "Please fill in every box!",
  "me.unlimited": "Unlimited",
  "me.credits": "{n} free problems left",
  "logout.confirm": "Log out?",
  "fb.about": "Problem: {about}",
  "fb.empty": "Can you write at least one line?",
  "fb.thanks": "Thanks! Got it 😊",
  "history.full": "Your phone is out of space, so I couldn't save this.",
  "history.button": "📚 Past problems ({n})",
  "history.summarizing": "Saving notes…",
  "history.finished": "✅ Solved",
  "history.paused": "⏸ Not finished",
  "history.delete": "Delete",
  "history.deleteConfirm": "Delete this one? You can't undo it.",
  "note.noAnswer": "Not solved yet",
  "date.today": "Today {time}",
  "date.day": "{date} {time}",
  "voice.denied": "Please allow the microphone. (Settings → Browser → Microphone)",
  "voice.silent": "I didn't hear anything. Tap 🎤 and try again?",
  "voice.failed": "Voice input didn't work. Can you type it instead?",
  "figure.aria": "Problem drawing",

  // 화면에 처음부터 적힌 글 (index.html의 data-i18n)
  "code.lead": "Enter your access code.<br />Your phone will remember it.",
  "code.ph": "Access code",
  "code.enter": "Enter",
  "login.idPh": "Username (a–z, 0–9)",
  "login.passPh": "Password (4+ characters)",
  "login.namePh": "Name (what your coach calls you)",
  "login.free": "Sign up to solve 5 problems for free.",
  "home.lead": "Snap a photo of a problem you're stuck on.<br />Instead of giving answers, I'll ask questions and we'll solve it together.",
  "home.camera": "📷 Take a photo",
  "home.album": "🖼️ Choose from photos",
  "home.type": "I'd rather type it",
  "home.feedback": "💬 Send feedback",
  "home.tipsTitle": "Tips for a good photo",
  "home.tip1": "One problem filling the screen",
  "home.tip2": "Bright light, no shadows",
  "home.tip3": "Paper straight, hold still",
  "home.tutorial": "📖 How to use",
  "home.logout": "Log out",
  "confirm.figureNote": "I read the drawing like this too. When I explain, I'll highlight parts of it in red.",
  "confirm.figureOff": "The drawing looks very different (remove it)",
  "confirm.editPh": "Type the problem exactly. If there's a drawing, describe it too (e.g. angle B = 90°, AB = 6 cm)",
  "confirm.yes": "Yes, let's go!",
  "confirm.edit": "Fix it",
  "common.home": "Back to start",
  "common.send": "Send",
  "common.skip": "Skip",
  "chat.problem": "📄 Today's problem",
  "chat.soundTitle": "Read your coach's messages aloud",
  "chat.new": "New problem",
  "chat.hint": "💡 Hint",
  "chat.dunno": "🤔 Not sure",
  "chat.again": "🔁 Explain again",
  "chat.mic": "Speak",
  "history.title": "📚 Past problems",
  "history.note": "Saved only on this phone. Photos are not saved.",
  "history.empty": "No problems yet.",
  "note.problem": "📄 See the problem",
  "note.steps": "Steps",
  "note.answer": "Answer:",
  "note.key": "💡 Key idea",
  "note.stuck": "⚠️ Watch out next time",
  "note.feedback": "💬 Feedback on this problem",
  "note.back": "Back to list",
  "fb.lead": "How was your coach? What you liked, what bugged you, a wrong explanation, anything.",
  "fb.up": "👍 Liked it",
  "fb.down": "👎 Not great",
  "fb.ph": "e.g. Too many questions / The explanation made sense / The photo was read wrong",
  "quick.title": "Nice work! 👏",
  "quick.lead": "Just tap the buttons. It helps your coach get better.",
  "quick.how": "How was this problem?",
  "quick.easy": "😊 Easy",
  "quick.okDiff": "🙂 Just right",
  "quick.hard": "😵 Hard",
  "quick.questions": "Your coach's questions were…",
  "quick.many": "Too many",
  "quick.okQ": "Just right",
  "quick.few": "Too few",
  "tut.1": `<div class="slide-art">
            <div class="mock-btn primary">📷 Take a photo</div>
            <div class="mock-btn">🖼️ Choose from photos</div>
          </div>
          <h2>1. Snap the problem</h2>
          <p>Fill the screen with one problem, in good light.<br />You can also pick a photo or type it.</p>`,
  "tut.2": `<div class="slide-art">
            <div class="mock-card">3(x − 2) = 2x + 5</div>
            <div class="mock-row"><span class="mock-btn primary small">Yes, let's go!</span><span class="mock-btn small">Fix it</span></div>
          </div>
          <h2>2. Check what I read</h2>
          <p>If I read it right, tap <b>Yes, let's go!</b><br />If something's wrong, tap <b>Fix it</b> and correct it.</p>`,
  "tut.3": `<div class="slide-art">
            <div class="mock-bubble tutor">What happens if you distribute the 3?</div>
            <div class="mock-bubble me">3x − 6!</div>
            <div class="mock-row"><span class="mock-chip">💡 Hint</span><span class="mock-chip">🤔 Not sure</span></div>
          </div>
          <h2>3. Solve it together in chat</h2>
          <p>Your coach asks one question at a time. Type your idea and tap <b>Send</b>.<br />Stuck? Tap <b>💡 Hint</b> or <b>🤔 Not sure</b>.</p>`,
  "tut.4": `<div class="slide-art">
            <div class="mock-row"><span class="mock-mic">🎤</span><span class="mock-input">I'm listening… go ahead</span></div>
          </div>
          <h2>4. You can talk, too</h2>
          <p>Tap <b>🎤</b> and speak, and it turns into text.<br />If it heard you wrong, fix it, then tap <b>Send</b>.</p>`,
  "tut.5": `<div class="slide-art">
            <div class="mock-bubble tutor">Nice! Now can you get all the x's on one side?<span class="mock-replay">🔊 Play again</span></div>
            <div class="mock-row"><span class="mock-chip on">🔊</span><span class="mock-chip">🔇</span></div>
          </div>
          <h2>5. Listen to your coach</h2>
          <p>Your coach's messages are read aloud.<br />Use <b>🔊</b> at the top to turn sound on or off, and <b>Play again</b> under a bubble to hear it again.</p>`,
  "tut.6": `<div class="slide-art">
            <div class="mock-btn">📚 Past problems</div>
            <div class="mock-btn">💬 Send feedback</div>
          </div>
          <h2>6. Review and tell us what you think</h2>
          <p>Solved problems are saved as notes in <b>📚 Past problems</b>.<br />Anything annoying? Tell us with <b>💬 Send feedback</b>!</p>`,
};

const DICTS = { ko, en };

// t("me.credits", { n: 3 }) → "남은 무료 문제 3개". 없는 말은 한국어로.
export function t(key, vars = {}) {
  const s = DICTS[lang][key] ?? ko[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// index.html의 data-i18n 표시가 붙은 곳을 지금 언어로 바꾼다(한국어는 그대로 둔다).
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  const dict = DICTS[lang];
  if (lang !== "ko") {
    const each = (attr, fn) => {
      for (const el of root.querySelectorAll(`[${attr}]`)) {
        const s = dict[el.getAttribute(attr)];
        if (s !== undefined) fn(el, s);
      }
    };
    each("data-i18n", (el, s) => (el.textContent = s));
    each("data-i18n-html", (el, s) => (el.innerHTML = s));
    each("data-i18n-ph", (el, s) => (el.placeholder = s));
    each("data-i18n-title", (el, s) => (el.title = s));
    each("data-i18n-aria", (el, s) => el.setAttribute("aria-label", s));
  }
  // 언어 버튼: 지금 아닌 언어 이름을 보여 준다. 누르면 다음 언어로 바꾸고 다시 연다.
  const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  for (const b of root.querySelectorAll("[data-lang-toggle]")) {
    b.textContent = `🌐 ${NAMES[next]}`;
    b.onclick = () => {
      try {
        localStorage.setItem("lang", next);
      } catch {}
      location.reload();
    };
  }
}

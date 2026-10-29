// 서버가 아이에게 보내는 말(오류 안내 등)을 화면 언어에 맞춘다.
// 폰은 요청마다 x-lang 머리말로 언어를 알려 준다(public/i18n.js). 없거나 모르는 언어면 한국어.
// 새 언어를 넣으려면 LANGS와 MESSAGES에 하나씩 더한다.

export const LANGS = ["ko", "en"];

export function langOf(req) {
  const lang = String(req?.headers?.["x-lang"] || "").toLowerCase();
  return LANGS.includes(lang) ? lang : "ko";
}

const MESSAGES = {
  ko: {
    badInvite: "초대 코드가 맞지 않아. 받은 링크나 코드를 다시 확인해 줘.",
    busy: "선생님이 잠깐 바빠요. 10초 뒤에 다시 해 볼래?",
    network: "앗, 연결에 문제가 생겼어. 다시 한 번 해 볼래?",
    noDb: "저장소가 아직 연결되지 않았어요. Vercel Storage에서 Upstash를 연결해 주세요.",
    badId: "아이디는 영어 소문자, 숫자, _ 로 3~20자로 만들어 줘.",
    idTaken: "이 아이디는 쓸 수 없어. 다른 걸로 해 줘.",
    shortPass: "비밀번호는 4자 이상으로 해 줘.",
    badName: "이름을 20자 안으로 적어 줘.",
    idExists: "이미 있는 아이디야. 다른 걸로 해 줘.",
    locked: "비밀번호를 {max}번 틀려서 {min}분 동안 잠겼어. 잠시 뒤에 다시 해 줘.",
    wrongPass: "아이디나 비밀번호가 맞지 않아.",
    wrongPassLeft: "아이디나 비밀번호가 맞지 않아. ({left}번 더 틀리면 {min}분 잠겨)",
    disabled: "이 계정은 지금 쓸 수 없어. 관리자에게 물어봐 줘.",
    relogin: "다시 로그인해 줘.",
    adminOnly: "관리자만 볼 수 있어.",
    dailyFull: "오늘은 선생님이 문제를 너무 많이 풀어서 마감했어. 내일 다시 만나! 🌙",
    noCredits: "무료 문제를 다 썼어. 더 풀고 싶으면 '의견 보내기'로 알려 줘!",
    restart: "문제를 처음부터 다시 올려 줄래?",
    tooLong: "대화가 너무 길어졌어. 새 문제로 시작해 볼까?",
    resend: "메시지를 다시 보내 줄래?",
    badPhoto: "사진을 다시 골라 줄래?",
    badProblem: "문제 내용을 다시 확인해 줄래?",
    noSummary: "이 기록은 정리할 수 없어.",
    emptyFeedback: "한 줄이라도 적어 줄래?",
  },
  en: {
    badInvite: "That invite code doesn't match. Please check the link or code you were given.",
    busy: "Your coach is a little busy. Try again in 10 seconds?",
    network: "Oops, something went wrong with the connection. Try once more?",
    noDb: "Storage isn't connected yet. Connect Upstash in Vercel Storage.",
    badId: "Usernames use 3–20 lowercase letters, numbers, or _.",
    idTaken: "You can't use this username. Please pick another one.",
    shortPass: "Passwords need at least 4 characters.",
    badName: "Please keep your name under 20 characters.",
    idExists: "That username is taken. Please pick another one.",
    locked: "Wrong password {max} times, so it's locked for {min} minutes. Try again a bit later.",
    wrongPass: "Username or password doesn't match.",
    wrongPassLeft: "Username or password doesn't match. ({left} more tries before a {min}-minute lock)",
    disabled: "This account can't be used right now. Please ask the admin.",
    relogin: "Please log in again.",
    adminOnly: "Only the admin can see this.",
    dailyFull: "Your coach solved a lot of problems today and is closed for now. See you tomorrow! 🌙",
    noCredits: "You've used all your free problems. Want more? Tell us with 'Send feedback'!",
    restart: "Can you upload the problem again from the start?",
    tooLong: "This chat got really long. Want to start a new problem?",
    resend: "Can you send your message again?",
    badPhoto: "Can you choose the photo again?",
    badProblem: "Can you check the problem text again?",
    noSummary: "This one can't be turned into notes.",
    emptyFeedback: "Can you write at least one line?",
  },
};

// say(req, "locked", { max: 5, min: 15 })
export function say(req, key, vars = {}) {
  const s = MESSAGES[langOf(req)][key] ?? MESSAGES.ko[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

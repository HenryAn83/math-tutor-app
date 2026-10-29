// 문제 그림을 깨끗하게 다시 그리고, 선생님이 말한 부분(선분, 점, 각, 그래프)을 빨갛게 깜빡인다.
// 그림 정보는 사진을 읽을 때 AI가 만든다(api/_prompts.js의 figure). 찍은 사진 위에 직접 표시하지 않는 건
// 사진이 기울거나 흐리면 위치가 자주 빗나가기 때문이다.
// 선생님 말 속 ⟦선분 AB⟧ 표시(또는 표시 없이 쓴 "선분 AB", "∠ABC" 같은 말)를 찾아 그림과 이어 준다.

import { lang, t } from "./i18n.js";

const NS = "http://www.w3.org/2000/svg";
const SIZE = 300; // 그림 한 변(화면 단위)
const PAD = 26;
let drawCount = 0; // 화면에 그림이 여러 개 있어도 잘라내기 이름이 겹치지 않게

// ---------- 그림이 쓸 만한지 ----------

export function usableFigure(f) {
  if (!f || f.kind === "none") return null;
  const names = new Set();
  const points = (f.points || []).filter((p) => {
    if (!p.name || !isFinite(p.x) || !isFinite(p.y) || names.has(p.name)) return false;
    names.add(p.name);
    return true;
  });
  const has = (n) => names.has(n);
  const clean = {
    kind: f.kind === "graph" ? "graph" : "geometry",
    points,
    segments: (f.segments || []).filter((s) => has(s.from) && has(s.to) && s.from !== s.to),
    circles: (f.circles || []).filter((c) => has(c.center) && c.radius > 0),
    angles: (f.angles || []).filter((a) => has(a.vertex) && has(a.from) && has(a.to)),
    curves: (f.curves || []).filter((c) => c.expr && compile(c.expr)),
    axes: f.axes,
  };
  if (clean.kind === "graph") {
    const a = clean.axes || {};
    if (!(a.x_max > a.x_min && a.y_max > a.y_min)) return null;
    if (!clean.curves.length && !clean.points.length) return null;
  } else if (clean.points.length < 2) {
    return null;
  }
  return clean;
}

// 대화 지침에 넣을 "그림에 있는 이름들" 한 줄
export function figureLabels(f) {
  if (!f) return "";
  const parts = [];
  const en = lang === "en";
  if (f.points.length) parts.push(`${en ? "Points" : "점"}: ${f.points.map((p) => p.name).join(", ")}`);
  if (f.segments.length) parts.push(`${en ? "Segments" : "선분"}: ${f.segments.map((s) => s.from + s.to).join(", ")}`);
  if (f.curves.length) parts.push(`${en ? "Graphs" : "그래프"}: ${f.curves.map((c) => c.name || c.expr).join(", ")}`);
  if (f.kind === "graph") parts.push(en ? "x-axis, y-axis" : "x축, y축");
  return parts.join(" / ").slice(0, 600);
}

// ---------- 그리기 ----------

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

// 그림을 그린 <svg>를 돌려준다. 각 부분에는 data-ref 이름표가 붙는다(깜빡일 때 찾으려고).
export function drawFigure(f) {
  const svg = el("svg", { viewBox: `0 0 ${SIZE} ${SIZE}`, class: "figure-svg", role: "img", "aria-label": t("figure.aria") });
  const map = makeMap(f);
  const P = Object.fromEntries(f.points.map((p) => [p.name, map(p.x, p.y)]));

  if (f.kind === "graph") drawAxes(svg, f, map);

  let clipId = "";
  if (f.curves.length) {
    // 그래프는 좌표 범위 밖으로 나가지 않게 잘라서 그린다
    const clip = el("clipPath", { id: (clipId = "fig-clip-" + ++drawCount) }, el("defs", {}, svg));
    el("rect", { x: PAD, y: PAD, width: SIZE - PAD * 2, height: SIZE - PAD * 2 }, clip);
  }
  for (const c of f.curves) {
    const d = curvePath(c, f, map);
    if (d) el("path", { d, class: "fig-line curve", "clip-path": `url(#${clipId})`, "data-ref": "curve:" + norm(c.name || c.expr) }, svg);
  }
  for (const c of f.circles) {
    const [cx, cy] = P[c.center];
    const r = Math.abs(map(f.points.find((p) => p.name === c.center).x + c.radius, 0)[0] - cx);
    el("circle", { cx, cy, r, class: "fig-line", fill: "none", "data-ref": "circle:" + c.center }, svg);
  }
  for (const s of f.segments) {
    const g = segment(svg, P[s.from], P[s.to], segKey(s.from, s.to));
    if (s.dashed) g.classList.add("dashed");
    if (s.text) label(svg, midLabel(P[s.from], P[s.to], centerOf(P)), s.text, "fig-len");
  }
  for (const a of f.angles) {
    angleMark(svg, P[a.from], P[a.vertex], P[a.to], a.right, angleKey(a.from, a.vertex, a.to));
    if (a.text && !a.right) label(svg, angleLabelPos(P[a.from], P[a.vertex], P[a.to]), a.text, "fig-len");
  }
  const center = centerOf(P);
  for (const p of f.points) {
    const [x, y] = P[p.name];
    el("circle", { cx: x, cy: y, r: 3.2, class: "fig-dot", "data-ref": "point:" + p.name }, svg);
    if (p.label !== false) {
      const dx = x - center[0], dy = y - center[1];
      const len = Math.hypot(dx, dy) || 1;
      label(svg, [x + (dx / len) * 13, y + (dy / len) * 13], p.name, "fig-name");
    }
  }
  return svg;
}

function makeMap(f) {
  let xmin, xmax, ymin, ymax;
  if (f.kind === "graph") {
    ({ x_min: xmin, x_max: xmax, y_min: ymin, y_max: ymax } = f.axes);
  } else {
    const xs = f.points.map((p) => p.x), ys = f.points.map((p) => p.y);
    for (const c of f.circles) {
      const p = f.points.find((q) => q.name === c.center);
      xs.push(p.x - c.radius, p.x + c.radius);
      ys.push(p.y - c.radius, p.y + c.radius);
    }
    [xmin, xmax, ymin, ymax] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // 도형은 가로세로 비율을 지킨다
    const span = Math.max(xmax - xmin, ymax - ymin) || 1;
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    [xmin, xmax, ymin, ymax] = [cx - span / 2, cx + span / 2, cy - span / 2, cy + span / 2];
  }
  const w = SIZE - PAD * 2;
  return (x, y) => [PAD + ((x - xmin) / (xmax - xmin)) * w, PAD + ((ymax - y) / (ymax - ymin)) * w];
}

function drawAxes(svg, f, map) {
  const { x_min, x_max, y_min, y_max } = f.axes;
  const g = el("g", { class: "fig-axes" }, svg);
  const y0 = Math.min(Math.max(0, y_min), y_max), x0 = Math.min(Math.max(0, x_min), x_max);
  // 눈금(정수)이 너무 많지 않을 때만 칸을 그린다
  if (x_max - x_min <= 24 && y_max - y_min <= 24) {
    for (let x = Math.ceil(x_min); x <= x_max; x++) {
      el("line", { x1: map(x, y_min)[0], y1: map(x, y_min)[1], x2: map(x, y_max)[0], y2: map(x, y_max)[1], class: "fig-grid" }, g);
    }
    for (let y = Math.ceil(y_min); y <= y_max; y++) {
      el("line", { x1: map(x_min, y)[0], y1: map(x_min, y)[1], x2: map(x_max, y)[0], y2: map(x_max, y)[1], class: "fig-grid" }, g);
    }
  }
  const [ax1, ay] = map(x_min, y0), [ax2] = map(x_max, y0);
  const [ax, ay1] = map(x0, y_max), [, ay2] = map(x0, y_min);
  el("line", { x1: ax1, y1: ay, x2: ax2, y2: ay, class: "fig-axis", "data-ref": "axis:x" }, g);
  el("line", { x1: ax, y1: ay1, x2: ax, y2: ay2, class: "fig-axis", "data-ref": "axis:y" }, g);
  label(g, [ax2 - 6, ay + 14], "x", "fig-name");
  label(g, [ax + 10, ay1 + 6], "y", "fig-name");
  if (x0 === 0 && y0 === 0) label(g, [ax - 9, ay + 13], "O", "fig-name");
}

function curvePath(c, f, map) {
  const fn = compile(c.expr);
  const { x_min, x_max, y_min, y_max } = f.axes || {};
  const from = Math.max(isFinite(c.x_from) ? c.x_from : x_min, x_min);
  const to = Math.min(isFinite(c.x_to) && c.x_to > from ? c.x_to : x_max, x_max);
  if (!(to > from)) return "";
  const range = y_max - y_min;
  let d = "", pen = false;
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const x = from + ((to - from) * i) / steps;
    const y = fn(x);
    // 범위를 크게 벗어나거나(분모 0 근처) 숫자가 아니면 선을 끊는다
    if (!isFinite(y) || y < y_min - range || y > y_max + range) {
      pen = false;
      continue;
    }
    const [px, py] = map(x, y);
    d += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    pen = true;
  }
  return d;
}

function segment(svg, a, b, key) {
  return el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "fig-line", "data-ref": "seg:" + key }, svg);
}

function angleMark(svg, a, v, b, right, key) {
  const u1 = unit(a, v), u2 = unit(b, v);
  let d;
  if (right) {
    const r = 11;
    const p1 = [v[0] + u1[0] * r, v[1] + u1[1] * r], p2 = [v[0] + u2[0] * r, v[1] + u2[1] * r];
    d = `M${p1}L${p1[0] + u2[0] * r},${p1[1] + u2[1] * r}L${p2}`;
  } else {
    const r = 18;
    const p1 = [v[0] + u1[0] * r, v[1] + u1[1] * r], p2 = [v[0] + u2[0] * r, v[1] + u2[1] * r];
    const cross = u1[0] * u2[1] - u1[1] * u2[0];
    d = `M${p1}A${r},${r} 0 0 ${cross > 0 ? 1 : 0} ${p2}`;
  }
  return el("path", { d, class: "fig-angle", fill: "none", "data-ref": "angle:" + key }, svg);
}

function label(parent, [x, y], text, cls) {
  const t = el("text", { x, y, class: cls, "text-anchor": "middle", "dominant-baseline": "middle" }, parent);
  t.textContent = text;
  return t;
}

const unit = (p, from) => {
  const dx = p[0] - from[0], dy = p[1] - from[1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const centerOf = (P) => {
  const all = Object.values(P);
  return [all.reduce((s, p) => s + p[0], 0) / all.length, all.reduce((s, p) => s + p[1], 0) / all.length];
};
function midLabel(a, b, center) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // 선분 바깥쪽(그림 가운데 반대쪽)에 쓴다
  let nx = -(b[1] - a[1]), ny = b[0] - a[0];
  const l = Math.hypot(nx, ny) || 1;
  [nx, ny] = [nx / l, ny / l];
  if ((m[0] - center[0]) * nx + (m[1] - center[1]) * ny < 0) [nx, ny] = [-nx, -ny];
  return [m[0] + nx * 15, m[1] + ny * 15];
}
function angleLabelPos(a, v, b) {
  const u1 = unit(a, v), u2 = unit(b, v);
  const bis = unit([u1[0] + u2[0], u1[1] + u2[1]], [0, 0]);
  return [v[0] + bis[0] * 32, v[1] + bis[1] * 32];
}

const segKey = (a, b) => [a, b].sort().join("|");
const angleKey = (a, v, b) => [a, b].sort().join("|") + "@" + v;
const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[−–]/g, "-").toLowerCase();

// ---------- 아주 작은 계산기 (그래프 식) ----------
// 숫자, x, + - * / ^, 괄호, sqrt(), abs() 만 안다. AI가 준 식을 그대로 실행(eval)하지 않으려고 직접 읽는다.

const cache = new Map();
export function compile(expr) {
  if (cache.has(expr)) return cache.get(expr);
  let fn = null;
  try {
    const src = String(expr).replace(/^\s*y\s*=/, "").replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/²/g, "^2").replace(/\s+/g, "");
    const tokens = src.match(/\d*\.?\d+|sqrt|abs|[x()+\-*/^]/g) || [];
    if (tokens.join("") !== src || src.length > 120) throw new Error("bad");
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];
    const primary = () => {
      const t = take();
      if (t === undefined) throw new Error("end");
      if (/^[\d.]/.test(t)) return () => Number(t);
      if (t === "x") return (x) => x;
      if (t === "(") {
        const e = sum();
        if (take() !== ")") throw new Error(")");
        return e;
      }
      if (t === "sqrt" || t === "abs") {
        if (take() !== "(") throw new Error("(");
        const e = sum();
        if (take() !== ")") throw new Error(")");
        return t === "sqrt" ? (x) => Math.sqrt(e(x)) : (x) => Math.abs(e(x));
      }
      if (t === "-") {
        const e = power();
        return (x) => -e(x);
      }
      throw new Error("token");
    };
    const power = () => {
      const base = primary();
      if (peek() === "^") {
        take();
        const exp = power();
        return (x) => Math.pow(base(x), exp(x));
      }
      return base;
    };
    // 2x, 3(x+1) 처럼 곱하기가 빠진 것도 받아 준다
    const product = () => {
      let left = power();
      while (peek() && (peek() === "*" || peek() === "/" || /^[\dx(sa]/.test(peek()))) {
        const op = peek() === "*" || peek() === "/" ? take() : "*";
        const right = power();
        const l = left;
        left = op === "*" ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      }
      return left;
    };
    const sum = () => {
      let left = product();
      while (peek() === "+" || peek() === "-") {
        const op = take();
        const right = product();
        const l = left;
        left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
      }
      return left;
    };
    const e = sum();
    if (i !== tokens.length) throw new Error("rest");
    fn = e;
  } catch {
    fn = null;
  }
  cache.set(expr, fn);
  return fn;
}

// ---------- 선생님 말 → 그림 부분 찾기 ----------

// 영어는 norm()으로 소문자가 된 뒤에 비교한다(예: "Segment AB" → "segmentab").
const KINDS = [
  [/^(선분|변|직선|반직선|segment|side|line|ray)/, "seg"],
  [/^(∠|각|angle)/, "angle"],
  [/^(△|삼각형|triangle)/, "poly"],
  [/^(□|사각형|quadrilateral|rectangle|square|parallelogram|trapezoid|rhombus)/, "poly"],
  [/^(점|point)/, "point"],
  [/^(원|circle)/, "circle"],
];

// 표시 안의 글(예: "선분 AB")을 그림 속 data-ref 목록으로 바꾼다. 못 찾으면 [].
export function resolveRef(text, f) {
  if (!f) return [];
  const t = norm(text);
  if (/^(x축|(the)?x-?axis)/.test(t) && f.kind === "graph") return ["axis:x"];
  if (/^(y축|(the)?y-?axis)/.test(t) && f.kind === "graph") return ["axis:y"];
  for (const c of f.curves) {
    const n = norm(c.name || c.expr);
    if (t === n || t.replace(/^(그래프|직선|함수|일차함수|이차함수|(the)?(graphof|lineof|line|graph|function|parabola))/, "").replace(/(의)?그래프$/, "") === n) return ["curve:" + n];
  }
  const exact = f.points.find((p) => norm(p.name) === t || "점" + norm(p.name) === t || "point" + norm(p.name) === t);
  if (exact) return ["point:" + exact.name];

  let kind = "";
  let rest = t.replace(/^the(?=segment|side|line|ray|angle|triangle|point|circle)/, "");
  for (const [re, k] of KINDS) {
    if (re.test(rest)) {
      kind = k;
      rest = rest.replace(re, "");
      break;
    }
  }
  const names = splitNames(rest, f.points);
  if (!names) return [];
  if (!kind) kind = names.length === 1 ? "point" : names.length === 2 ? "seg" : "poly";
  if (kind === "point" && names.length === 1) return ["point:" + names[0]];
  if (kind === "circle" && names.length === 1) return f.circles.some((c) => c.center === names[0]) ? ["circle:" + names[0]] : [];
  if (kind === "seg" && names.length === 2) return ["seg:" + segKey(names[0], names[1])];
  if (kind === "poly" && names.length >= 3) {
    return names.map((n, i) => "seg:" + segKey(n, names[(i + 1) % names.length]));
  }
  if (kind === "angle") {
    if (names.length === 3) return ["angle:" + angleKey(names[0], names[1], names[2])];
    if (names.length === 1) {
      const a = f.angles.find((x) => x.vertex === names[0]);
      return a ? ["angle:" + angleKey(a.from, a.vertex, a.to)] : ["point:" + names[0]];
    }
  }
  return [];
}

// "AB" → ["A","B"], "A'B" → ["A'","B"] (그림에 있는 점 이름만, 긴 이름 먼저)
function splitNames(s, points) {
  const names = points.map((p) => p.name).sort((a, b) => b.length - a.length);
  const out = [];
  let rest = s;
  while (rest) {
    const n = names.find((x) => rest.startsWith(norm(x)));
    if (!n) return null;
    out.push(n);
    rest = rest.slice(norm(n).length);
  }
  return out.length ? out : null;
}

// 표시 없이 쓴 말도 찾아서 ⟦ ⟧로 감싼다(그림에 실제로 있는 것만).
const LOOSE =
  /(선분|변|직선|반직선|삼각형|사각형|각|점|원)\s?([A-Z][A-Z'′₁₂₃0-9]*)|[∠△□]\s?([A-Z][A-Z'′₁₂₃0-9]*)|\b(?:[Ss]egment|[Ss]ide|[Ll]ine|[Rr]ay|[Tt]riangle|[Aa]ngle|[Pp]oint|[Cc]ircle)\s([A-Z][A-Z'′₁₂₃0-9]*)\b/g;

export function markRefs(text, f) {
  if (!f) return text;
  return text
    .split(/(⟦[^⟧]*⟧)/)
    .map((part) =>
      part.startsWith("⟦") ? part : part.replace(LOOSE, (m) => (resolveRef(m, f).length ? `⟦${m}⟧` : m)),
    )
    .join("");
}

// ---------- 깜빡이기 ----------

// svg 안의 해당 부분을 빨갛게 2.4초 깜빡인다. 그림에 없던 선분(대각선 등)은 잠깐 점선으로 그려 준다.
export function blink(svg, refs, f) {
  if (!svg || !refs.length) return false;
  let found = false;
  for (const ref of refs) {
    let nodes = [...svg.querySelectorAll(`[data-ref="${CSS.escape(ref)}"]`)];
    if (!nodes.length) nodes = temporary(svg, ref, f);
    // 각을 말할 때는 꼭짓점도 같이
    if (ref.startsWith("angle:")) {
      const v = svg.querySelector(`[data-ref="${CSS.escape("point:" + ref.split("@")[1])}"]`);
      if (v) nodes.push(v);
    }
    for (const n of nodes) {
      found = true;
      n.classList.remove("fig-hl");
      void n.getBoundingClientRect(); // 애니메이션 다시 시작
      n.classList.add("fig-hl");
      clearTimeout(n._hl);
      n._hl = setTimeout(() => {
        n.classList.remove("fig-hl");
        if (n.dataset.temp) n.remove();
      }, 2600);
    }
  }
  return found;
}

function temporary(svg, ref, f) {
  const map = makeMap(f);
  const P = Object.fromEntries(f.points.map((p) => [p.name, map(p.x, p.y)]));
  let node = null;
  if (ref.startsWith("seg:")) {
    const [a, b] = ref.slice(4).split("|");
    node = segment(svg, P[a], P[b], ref.slice(4));
    node.classList.add("dashed");
  } else if (ref.startsWith("angle:")) {
    const [ends, v] = ref.slice(6).split("@");
    const [a, b] = ends.split("|");
    node = angleMark(svg, P[a], P[v], P[b], false, ref.slice(6));
  }
  if (!node) return [];
  node.dataset.temp = "1";
  // 점이 선 위에 보이게 맨 아래로
  svg.insertBefore(node, svg.querySelector(".fig-dot"));
  return [node];
}

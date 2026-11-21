/**
 * Fabtrack: hexagonal badge with stylized F relief and detached right chevron,
 * poised above a rounded reader plinth. Moving the pointer lifts and tilts the
 * badge toward the hand as if presenting a contactless token; the slider sets
 * the maximum tilt angle in degrees.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, poly, proj, rad, r2, rings, prism,
  spring, stepS, unproj, disposer, mk, put, place, pointer, reflect, register, solid,
} = HL;

const H_BADGE = 8.5, Z_REST = 14, Z_LIFT = 23, REST_RX = -10, REST_RY = 7;

const HEX_PTS = fillet(
  [[-43, 0], [-24, -32], [13, -32], [32, 0], [13, 32], [-24, 32]],
  [1.6, 1.6, 1.6, 1.6, 1.6, 1.6], 3,
);
const HEX_IN = fillet(
  [[-40.8, 0], [-22.8, -30], [11.8, -30], [29.8, 0], [11.8, 30], [-22.8, 30]],
  [1.2, 1.2, 1.2, 1.2, 1.2, 1.2], 3,
);
// Detached right chevron (#1): upper and lower arms meeting at (44, 0)
const CHEV_TOP = fillet(
  [[18, -32], [25, -32], [44, 0], [25, 32], [18, 32], [37, 0]],
  [1.2, 1.2, 1.6, 1.2, 1.2, 1.6], 3,
);
const CHEV_IN = fillet(
  [[20.2, -29.8], [23.8, -29.8], [41.6, 0], [23.8, 29.8], [20.2, 29.8], [38.2, 0]],
  [0.9, 0.9, 1.2, 0.9, 0.9, 1.2], 3,
);

const F_TOP = fillet(
  [[-21, -20], [11, -20], [11, -11], [-11, -11], [-11, -2], [-15, 2], [-21, 5]],
  [1, 1, 1, 1, 2, 2, 1], 2,
);
const F_BOT = fillet(
  [[-21, 8], [-12, 2], [8, 2], [8, 10], [-11, 10], [-11, 19], [-21, 23]],
  [1, 2, 1, 1, 1, 2, 1], 2,
);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let maxTilt = value;

  const C = Cam(45, 0.5, 2.02);
  fit(C, [[-50, -40, 0], [50, 40, 0], [-45, -34, 40], [45, 34, 40]], 200, 174);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [baseOut, baseIn] = rings(-49, -39, 49, 39, 9, 1.4);
  reflect(svg, g, P, front, baseOut, 0, 12);
  put(solid(g), prism(P, front, baseOut, baseIn, 0, 5));

  const dot = mk("circle", { r: 1.8, class: "dot" }, g);
  place(dot, P(-36, 30, 5));

  const badgeG = mk("g", {}, g);
  const hexSil = mk("path", { class: "sil" }, badgeG);
  const hexCr = mk("path", { class: "nf lo" }, badgeG);
  const fTopPath = mk("path", { class: "nf" }, badgeG);
  const fBotPath = mk("path", { class: "nf" }, badgeG);
  const chevBot = mk("path", { class: "sil" }, badgeG);
  const chevTop = mk("path", { class: "sil" }, badgeG);
  const chevCr = mk("path", { class: "nf lo" }, badgeG);

  const sRx = spring(REST_RX), sRy = spring(REST_RY), sZ = spring(Z_REST);
  let active = false, lastKey = "";

  function draw(rxDeg, ryDeg, zp) {
    const key = `${r2(rxDeg)},${r2(ryDeg)},${r2(zp)}`;
    if (key === lastKey) return;
    lastKey = key;

    const ax = rad(rxDeg), ay = rad(ryDeg);
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
    const w = (u, v, lz) => {
      const y1 = v * cx - lz * sx, z1 = v * sx + lz * cx;
      const x2 = u * cy + z1 * sy, z2 = -u * sy + z1 * cy;
      return P(x2, y1, zp + z2);
    };

    const hBot = HEX_PTS.map(([u, v]) => w(u, v, 0));
    const hTop = HEX_PTS.map(([u, v]) => w(u, v, H_BADGE));
    hexSil.setAttribute("d", poly(hull([...hBot, ...hTop])));
    hexCr.setAttribute("d", poly(HEX_IN.map(([u, v]) => w(u, v, H_BADGE))));

    fTopPath.setAttribute("d", poly(F_TOP.map(([u, v]) => w(u, v, H_BADGE))));
    fBotPath.setAttribute("d", poly(F_BOT.map(([u, v]) => w(u, v, H_BADGE))));

    chevBot.setAttribute("d", poly(CHEV_TOP.map(([u, v]) => w(u, v, 0))));
    chevTop.setAttribute("d", poly(CHEV_TOP.map(([u, v]) => w(u, v, H_BADGE))));
    chevCr.setAttribute("d", poly(CHEV_IN.map(([u, v]) => w(u, v, H_BADGE))));
  }

  function setHighlight(on) {
    active = on;
    chevTop.classList.toggle("hi", on);
    chevBot.classList.toggle("hi", on);
    dot.setAttribute("class", on ? "dot m" : "dot");
    read.textContent = on ? "read · ready" : "rest";
  }

  function retarget(pt) {
    if (!pt) {
      sRx.t = REST_RX;
      sRy.t = REST_RY;
      sZ.t = Z_REST;
      setHighlight(false);
      loop.wake();
      return;
    }
    const [wx, wy] = unproj(C, pt[0], pt[1], Z_REST);
    const inside = Math.abs(wx) <= 50 && Math.abs(wy) <= 40;
    if (!inside) {
      sRx.t = REST_RX;
      sRy.t = REST_RY;
      sZ.t = Z_REST;
      setHighlight(false);
    } else {
      sRx.t = REST_RX + clamp(wy / 36, -1, 1) * maxTilt;
      sRy.t = REST_RY - clamp(wx / 46, -1, 1) * maxTilt;
      sZ.t = Z_LIFT;
      setHighlight(true);
    }
    loop.wake();
  }

  const loop = register(stage, (dt) => {
    const m1 = stepS(sRx, dt), m2 = stepS(sRy, dt), m3 = stepS(sZ, dt);
    draw(sRx.x, sRy.x, sZ.x);
    return m1 || m2 || m3;
  });

  draw(REST_RX, REST_RY, Z_REST);
  setHighlight(false);

  bag.add(loop.unregister);
  bag.add(pointer(stage, {
    move: retarget,
    down: retarget,
    leave: () => retarget(null),
  }));

  return {
    set: (v) => {
      maxTilt = v;
      if (active) loop.wake();
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "fabtrack",
  means: "The Fabtrack hexagonal badge tilts toward the pointer over a reader plinth.",
  rules: [1, 3, 4, 5, 8, 9, 10],
  range: [8, 16, 26],
  tour: [[245, 130], [150, 185], [240, 200], null],
  mount,
});

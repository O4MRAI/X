import { expect, test, type Page } from "@playwright/test";
const base = process.env.VITE_BASE_PATH || "/";
const snapshot = (page: Page) => page.evaluate(() => window.__CONVOY__?.());
async function loaded(page: Page, url = "./") {
  await page.goto(url);
  await expect(
    page.getByRole("button", { name: "PLAY LEVEL", exact: true }),
  ).toBeEnabled({ timeout: 25000 });
}
async function walkToEdge(page: Page) {
  const start = (await snapshot(page))!.simulationTime;
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await snapshot(page))!.simulationTime - start, {
      intervals: [20],
      timeout: 10000,
    })
    .toBeGreaterThan(0.4);
}
test("real keyboard transfer, paused clocks, real finish, and persistent unlock", async ({
  page,
}) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loaded(page);
  await page.screenshot({ path: "/tmp/convoy-menu.png" });
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.pointerLockElement?.tagName))
    .toBe("CANVAS");
  await walkToEdge(page);
  await page.keyboard.press("Space");
  await expect
    .poll(async () => (await snapshot(page))!.visited, {
      intervals: [35],
      timeout: 15000,
    })
    .toBeGreaterThan(1);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect((await snapshot(page))!.landings).toBeGreaterThan(0);
  await page.screenshot({ path: "/tmp/convoy-playing.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(600);
  expect((await snapshot(page))!.time).toBe(paused!.time);
  expect((await snapshot(page))!.position).toEqual(paused!.position);
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Perfect landing." }),
  ).toBeVisible({ timeout: 80000 });
  const result = (await snapshot(page))!;
  expect(result.visited).toBeGreaterThan(1);
  expect(result.time).toBeLessThan(70);
  expect(result.position.z).toBeLessThan(-438);
  await page.screenshot({ path: "/tmp/convoy-completed.png" });
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("convoy-leap-progress")!),
  );
  expect(save.unlockedLevel).toBe(2);
  expect(save.best["1"]).toBeGreaterThan(20);
  expect(save.abilities).toContain("double");
  console.log("Browser playthrough:", {
    seconds: result.time,
    fps: result.fps,
    drawCalls: result.drawCalls,
    bodies: result.bodies,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "PLAY LEVEL", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /02 Open water/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /03 Passing lane/ }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
test("20 immediate keyboard retries, a single jump, side fall, and retry button", async ({
  page,
}) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loaded(page);
  const initialUrl = page.url();
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  await page.waitForTimeout(600);
  const resources = (await snapshot(page))!;
  for (let i = 0; i < 20; i++) await page.keyboard.press("r");
  await expect.poll(async () => (await snapshot(page))?.phase).toBe("Playing");
  expect((await snapshot(page))!.bodies).toBe(28);
  expect((await snapshot(page))!.geometries).toBeLessThanOrEqual(
    resources.geometries + 2,
  );
  expect((await snapshot(page))!.textures).toBeLessThanOrEqual(
    resources.textures + 2,
  );
  await expect(page.locator("canvas[aria-label]")).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page))?.jumps).toBe(1);
  await page.keyboard.down("d");
  await expect(
    page.getByRole("heading", { name: "One more leap." }),
  ).toBeVisible({ timeout: 20000 });
  await page.keyboard.up("d");
  await page.getByRole("button", { name: "RETRY LEVEL", exact: true }).click();
  await expect.poll(async () => (await snapshot(page))?.phase).toBe("Playing");
  expect((await snapshot(page))!.jumps).toBe(0);
  expect((await snapshot(page))!.level).toBe(1);
  expect((await snapshot(page))!.support).toBe(0);
  expect((await snapshot(page))!.time).toBeLessThan(1);
  expect(page.url()).toBe(initialUrl);
  expect(navigations).toBe(0);
  expect((await snapshot(page))!.look.yaw).toBe(0);
  await walkToEdge(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1100);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  await expect
    .poll(async () => (await snapshot(page))!.visited, { timeout: 10000 })
    .toBeGreaterThan(1);
  expect((await snapshot(page))!.phase).toBe("Playing");
  expect(errors).toEqual([]);
});
test("settings recover from corruption; mouse look and lost capture pause correctly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("convoy-leap-progress", "corrupt");
    localStorage.setItem("convoy-leap-settings", "corrupt");
  });
  await loaded(page);
  await page
    .getByRole("button", { name: "Game settings", exact: true })
    .click();
  await page.getByLabel(/Field of view/).fill("75");
  await page.getByLabel(/Graphics/).selectOption("low");
  await page.getByLabel(/Volume/).fill("0");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Grappling hook · locked" }),
  ).toHaveJSProperty("disabled", true);
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  const y = (await snapshot(page))!.position.y;
  await page.mouse.move(600, 300);
  await page.mouse.move(800, 700);
  await expect
    .poll(async () => Math.abs((await snapshot(page))!.look.yaw))
    .toBeGreaterThan(0.1);
  await page.keyboard.down("w");
  await page.waitForTimeout(200);
  await page.keyboard.up("w");
  expect(Math.abs((await snapshot(page))!.position.y - y)).toBeLessThan(0.4);
  await page.evaluate(() => document.exitPointerLock());
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("convoy-leap-settings")!).fov,
    ),
  ).toBe(75);
});
test("Android-sized portrait and landscape touch play", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loaded(page, `http://localhost:5173${base}`);
  await page.screenshot({ path: "/tmp/convoy-mobile-menu.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jump", exact: true }).tap();
  await expect.poll(async () => (await snapshot(page))?.jumps).toBe(1);
  await page.getByRole("button", { name: "Pause game" }).tap();
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 852, height: 393 });
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "RESUME", exact: true }).tap();
  await expect(
    page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeInViewport();
  const before = (await snapshot(page))!.look.yaw;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 540, y: 120, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 600, y: 120, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect((await snapshot(page))!.look.yaw).not.toBe(before);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await expect
    .poll(() =>
      page.getByLabel("Drag to look").evaluate((el) => el.matches(":active")),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Pause game" }).tap();
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restart level" }).tap();
  await expect
    .poll(async () => (await snapshot(page))?.simulationTime)
    .toBeLessThan(0.3);
  const stick = (await page.getByLabel("Move joystick").boundingBox())!;
  const jump = (await page
    .getByRole("button", { name: "Jump", exact: true })
    .boundingBox())!;
  const finger = {
    x: stick.x + stick.width / 2,
    y: stick.y + stick.height / 2,
    id: 1,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  finger.y -= 40;
  const began = (await snapshot(page))!.simulationTime;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [finger],
  });
  await expect(
    page.getByRole("button", { name: "Sprint", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await snapshot(page))!.simulationTime - began, {
      intervals: [20],
    })
    .toBeGreaterThan(0.4);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      finger,
      { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 },
    ],
  });
  await expect
    .poll(async () => (await snapshot(page))!.visited, {
      intervals: [30],
      timeout: 10000,
    })
    .toBeGreaterThan(1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.getByRole("button", { name: "Sprint", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect((await snapshot(page))!.phase).toBe("Playing");
  await page.screenshot({ path: "/tmp/convoy-mobile-playing.png" });
  const fallFinger = {
    x: stick.x + stick.width / 2,
    y: stick.y + stick.height / 2,
    id: 1,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [fallFinger],
  });
  fallFinger.x += 40;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [fallFinger],
  });
  await expect(
    page.getByRole("button", { name: "RETRY LEVEL", exact: true }),
  ).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByRole("button", { name: "RETRY LEVEL", exact: true }).tap();
  await expect.poll(async () => (await snapshot(page))?.phase).toBe("Playing");
  expect((await snapshot(page))!.support).toBe(0);
  expect((await snapshot(page))!.time).toBeLessThan(1);
  expect((await snapshot(page))!.look.yaw).toBe(0);
  await expect(
    page.getByRole("button", { name: "Sprint", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
  await ctx.close();
});
test("production assets and physics work offline inside the site path", async ({
  browser,
}) => {
  const ctx = await browser.newContext(),
    page = await ctx.newPage();
  await loaded(page, `http://localhost:4173${base}`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  expect(
    await page.evaluate(
      () => new URL(navigator.serviceWorker.controller!.scriptURL).pathname,
    ),
  ).toBe(`${base}sw.js`);
  const manifest = await (
    await page.request.get(`http://localhost:4173${base}manifest.webmanifest`)
  ).json();
  expect(manifest.name).toBe("CONVOY LEAP");
  expect(manifest.scope).toBe("./");
  await ctx.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "PLAY LEVEL", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  await expect(page.locator(".crosshair")).toBeVisible();
  await ctx.close();
});
test("online navigation replaces stale cached HTML and stays current offline", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loaded(page, `http://localhost:4173${base}`);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const script = await page
    .locator('script[type="module"]')
    .getAttribute("src");
  const foreignAsset = await page.evaluate(async (siteBase) => {
    const cache = await caches.open("unrelated-old-release");
    const url = `${siteBase}stale-asset-test.txt`;
    await cache.put(url, new Response("STALE ASSET"));
    return (await fetch(url)).text();
  }, base);
  expect(foreignAsset).not.toBe("STALE ASSET");
  await page.evaluate(async (siteBase) => {
    const keys = await caches.keys();
    const key = keys.find((name) =>
      name.startsWith(`convoy-leap-${encodeURIComponent(siteBase)}-`),
    );
    if (!key) throw new Error("Offline cache was not installed");
    const cache = await caches.open(key);
    await cache.put(
      `${siteBase}index.html`,
      new Response("<!doctype html><h1>STALE RELEASE</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
  }, base);
  await loaded(page, `http://localhost:4173${base}index.html`);
  await expect(page.locator('script[type="module"]')).toHaveAttribute(
    "src",
    script!,
  );
  await expect(
    page.getByRole("heading", { name: "STALE RELEASE" }),
  ).toHaveCount(0);
  await ctx.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "PLAY LEVEL", exact: true }),
  ).toBeEnabled();
  await expect(page.locator('script[type="module"]')).toHaveAttribute(
    "src",
    script!,
  );
  expect(errors).toEqual([]);
  await ctx.close();
});
test("mouse-capture rejection stays in the menu with a useful recovery message", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => {
      throw Error("blocked");
    };
  });
  await loaded(page);
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Mouse capture was blocked",
  );
  await expect(
    page.getByRole("button", { name: "PLAY LEVEL", exact: true }),
  ).toBeVisible();
  expect((await snapshot(page))!.phase).not.toBe("Playing");
});
test("unavailable WebGL offers a reload", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText(
    "Could not load the 3D game",
  );
  await expect(page.getByRole("button", { name: "Reload game" })).toBeVisible();
});
test("equipped double jump and slow motion respond to their keys and freeze on pause", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "convoy-leap-progress",
      JSON.stringify({ unlockedLevel: 7, best: {} }),
    ),
  );
  await loaded(page);
  await page.getByRole("button", { name: "Abilities", exact: true }).click();
  await page
    .getByLabel("Movement ability", { exact: true })
    .selectOption("double");
  await page
    .getByLabel("Utility ability", { exact: true })
    .selectOption("slow");
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "PLAY LEVEL", exact: true }).click();
  await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page))!.jumps).toBe(1);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page))!.jumps).toBe(2);
  await page.keyboard.press("Space");
  expect((await snapshot(page))!.jumps).toBe(2);
  await page.keyboard.press("q");
  await expect
    .poll(async () => (await snapshot(page))!.scale)
    .toBeLessThan(0.6);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "RESUME", exact: true }),
  ).toBeVisible();
  const paused = (await snapshot(page))!;
  await page.waitForTimeout(500);
  expect((await snapshot(page))!.scale).toBe(paused.scale);
  expect((await snapshot(page))!.slow).toBe(paused.slow);
});

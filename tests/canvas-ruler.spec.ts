import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { io } = require("socket.io-client");
const api = "http://127.0.0.1:3199",
  web = "http://127.0.0.1:4199";
const canvasId = "00000000-0000-4000-8000-000000000001",
  privateId = "00000000-0000-4000-8000-000000000002";
const contexts: BrowserContext[] = [];
test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__test/reset`);
});
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});
test("long wide author names never clip the distance at the right/bottom edges", async ({
  browser,
  request,
}) => {
  const { token } = await (
    await request.get(`${api}/__test/session/owner?name=${"W".repeat(40)}`)
  ).json();
  const context = await browser.newContext({
    viewport: { width: 1000, height: 900 },
    locale: "en-US",
  });
  contexts.push(context);
  await context.addInitScript((token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("qcanva:locale", "en");
  }, token);
  const page = await context.newPage();
  await page.goto(`${web}/canvas/${canvasId}`);
  await expect(page.getByTestId("ruler-tool")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () => {
      const stats = await (await request.get(`${api}/__test/stats`)).json();
      return stats.sockets.some(
        (s: any) => s.canvasId === canvasId && s.userId === "owner",
      );
    })
    .toBe(true);
  await page.getByTestId("ruler-tool").click();
  for (const width of [1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const viewport = page.locator(".canvas-viewport");
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
    const label = page.getByTestId("ruler-label");
    await expect(label).toContainText("W".repeat(40));
    const bounds = (await label.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(box.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.height);
    const distance = label.locator(".ruler-distance");
    await expect(distance).toBeVisible();
    const geometry = await distance.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
    const distanceBox = (await distance.boundingBox())!;
    expect(distanceBox.x + distanceBox.width).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    await page.mouse.up();
  }
});
async function open(
  browser: Browser,
  request: APIRequestContext,
  role = "reader",
  options: Record<string, any> = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    ...options,
  });
  contexts.push(context);
  if (role !== "guest") {
    const { token } = await (
      await request.get(`${api}/__test/session/${role}`)
    ).json();
    await context.addInitScript((token) => {
      localStorage.setItem("token", token);
      localStorage.setItem("qcanva:locale", "en");
    }, token);
  }
  const page = await context.newPage();
  await page.goto(`${web}/canvas/${canvasId}`);
  await expect(page.locator('[data-testid="ruler-tool"]:visible, [data-testid="mobile-plugin-ruler"]:visible')).toBeVisible();
  await expect
    .poll(async () => {
      const stats = await (await request.get(`${api}/__test/stats`)).json();
      return stats.sockets.some(
        (s: any) =>
          s.canvasId === canvasId &&
          (role === "guest"
            ? s.userId.startsWith("guest:")
            : s.userId === role),
      );
    })
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("img.node-image")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  return page;
}
async function begin(page: Page) {
  await page.getByTestId("ruler-tool").click();
  const image = (await page.locator("img.node-image").boundingBox())!;
  const start = { x: image.x + 20, y: image.y + 20 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  return start;
}
test("owner and reader see exact final measurements, simultaneous gestures and 3-second expiry without content/image changes", async ({
  browser,
  request,
}) => {
  const owner = await open(browser, request, "owner"),
    reader = await open(browser, request);
  const imageRequests = (
    await (await request.get(`${api}/__test/stats`)).json()
  ).imageRequests;
  for (const page of [owner, reader])
    await page.evaluate(() => {
      (window as any).__image = document.querySelector("img.node-image");
    });
  const start = await begin(owner);
  await owner.mouse.move(start.x + 300, start.y + 400, { steps: 10 });
  await owner.mouse.up();
  await expect(owner.getByTestId("ruler-label")).toHaveText("Owner · 5.00 m");
  await expect(reader.getByTestId("ruler-label")).toHaveText("Owner · 5.00 m");
  const second = await begin(reader);
  await reader.mouse.move(second.x + 100, second.y, { steps: 3 });
  await expect(owner.getByTestId("ruler-label")).toHaveCount(2);
  await expect(reader.getByTestId("ruler-label")).toHaveCount(2);
  await reader.mouse.up();
  await expect(
    reader.getByTestId("ruler-label").filter({ hasText: "Reader · 1.00 m" }),
  ).toBeVisible();
  await expect(owner.getByTestId("ruler-label")).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(reader.getByTestId("ruler-label")).toHaveCount(0);
  for (const page of [owner, reader])
    expect(
      await page.evaluate(
        () =>
          document.querySelector("img.node-image") === (window as any).__image,
      ),
    ).toBe(true);
  const stats = await (await request.get(`${api}/__test/stats`)).json();
  expect(stats.imageRequests).toBe(imageRequests);
  expect(stats.contentWrites).toBe(0);
  expect(stats.revisions).toEqual([0, 0]);
});
test("late join sees held measurement, settings propagate, disabling plugin cancels everyone", async ({
  browser,
  request,
}) => {
  const owner = await open(browser, request, "owner");
  const start = await begin(owner);
  await owner.mouse.move(start.x + 300, start.y + 400);
  const reader = await open(browser, request);
  await expect(reader.getByTestId("ruler-label")).toHaveText("Owner · 5.00 m");
  await owner.mouse.up();
  const { token } = await (
    await request.get(`${api}/__test/session/owner`)
  ).json();
  const saved = await request.put(
    `${api}/api/canvas/${canvasId}/ruler-settings`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { unit: "ft", metersPerCanvasUnit: 0.01 },
    },
  );
  expect(saved.ok()).toBe(true);
  await expect(reader.getByTestId("ruler-label")).toHaveText(
    "Owner · 16.40 ft",
  );
  const joined = await open(browser, request, "guest");
  await expect(joined.getByTestId("ruler-label")).toHaveText(
    "Owner · 16.40 ft",
  );
  await request.put(`${api}/api/plugins/canvas/${canvasId}/ruler`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { enabled: false },
  });
  for (const page of [owner, reader, joined]) {
    await expect(page.getByTestId("ruler-label")).toHaveCount(0);
    await expect(page.getByTestId("ruler-tool")).toHaveCount(0);
  }
});
test("owner form saves canonical scale, readers cannot configure, unknown/guest access to private room is rejected", async ({
  browser,
  request,
}) => {
  const owner = await open(browser, request, "owner");
  await owner.getByRole("button", { name: "Plugins", exact: true }).click();
  await owner.getByTestId("ruler-scale").fill("200");
  await owner
    .locator(".canvas-ruler-settings")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(owner.locator(".canvas-ruler-settings button")).toBeEnabled();
  const reader = await open(browser, request);
  const start = await begin(reader);
  await reader.mouse.move(start.x + 300, start.y + 400);
  await reader.mouse.up();
  await expect(reader.getByTestId("ruler-label")).toHaveText("Reader · 2.50 m");
  const { token } = await (
    await request.get(`${api}/__test/session/reader`)
  ).json();
  expect(
    (
      await request.put(`${api}/api/canvas/${canvasId}/ruler-settings`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { unit: "m", metersPerCanvasUnit: 0.1 },
      })
    ).status(),
  ).toBe(403);
  const socket = io(`${api}/canvas-ws`, { transports: ["websocket"] });
  try {
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    const denied = new Promise<any>((resolve) => socket.once("error", resolve));
    socket.emit("join-canvas", { canvasId: privateId });
    expect(await denied).toMatchObject({ message: "No access to this canvas" });
    expect((await request.get(`${api}/api/canvas/${privateId}`)).status()).toBe(
      403,
    );
  } finally {
    socket.disconnect();
  }
});
test("touch drag in a small dark viewport stays bounded, second finger cancels and pinch camera still works", async ({
  browser,
  request,
}) => {
  const page = await open(browser, request, "guest", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  await page.getByTestId("mobile-plugin-ruler").tap();
  const image = (await page.locator("img.node-image").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const start = { x: Math.round(image.x + 30), y: Math.round(image.y + 30) },
    end = { x: start.x + 70, y: start.y + 80 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...end, id: 1 }],
  });
  await expect(page.getByTestId("ruler-label")).toHaveCount(1);
  const label = (await page.getByTestId("ruler-label").boundingBox())!;
  expect(label.x).toBeGreaterThanOrEqual(0);
  expect(label.x + label.width).toBeLessThanOrEqual(390);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { ...end, id: 1 },
      { x: end.x + 50, y: end.y, id: 2 },
    ],
  });
  await expect(page.getByTestId("ruler-label")).toHaveCount(0);
  const before = await page.locator(".canvas-world").getAttribute("style");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { ...end, id: 1 },
      { x: end.x + 100, y: end.y + 30, id: 2 },
    ],
  });
  await expect(page.locator(".canvas-world")).not.toHaveAttribute(
    "style",
    before!,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 3 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...end, id: 3 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByTestId("ruler-label")).toHaveCount(1);
  await expect(page.getByTestId("ruler-label")).toHaveCount(0, {
    timeout: 5000,
  });
  await cdp.detach();
});
test("transport reconnect clears old measurements without replay and allows a fresh gesture", async ({
  browser,
  request,
}) => {
  const owner = await open(browser, request, "owner"),
    reader = await open(browser, request);
  const start = await begin(owner);
  await owner.mouse.move(start.x + 100, start.y);
  await expect(reader.getByTestId("ruler-label")).toHaveText("Owner · 1.00 m");
  const oldId = (
    await (await request.get(`${api}/__test/stats`)).json()
  ).sockets.find((s: any) => s.userId === "owner").id;
  await request.post(`${api}/__test/disconnect/owner`);
  await expect(reader.getByTestId("ruler-label")).toHaveCount(0);
  await expect(owner.getByTestId("ruler-label")).toHaveCount(0);
  await owner.mouse.up();
  await expect
    .poll(async () => {
      const stats = await (await request.get(`${api}/__test/stats`)).json();
      return stats.sockets.some(
        (s: any) =>
          s.userId === "owner" && s.id !== oldId && s.canvasId === canvasId,
      );
    })
    .toBe(true);
  await expect(reader.getByTestId("ruler-label")).toHaveCount(0);
  // Mode stays enabled across a transport outage, but held-pointer state does not.
  await owner.mouse.move(start.x, start.y);
  await owner.mouse.down();
  await owner.mouse.move(start.x + 300, start.y + 400);
  await owner.mouse.up();
  await expect(reader.getByTestId("ruler-label")).toHaveText("Owner · 5.00 m");
});
test("wheel and middle-button preserve camera control; ruler movement does not repaint the image world layer", async ({
  browser,
  request,
}) => {
  const page = await open(browser, request, "owner");
  await page.getByTestId("ruler-tool").click();
  const world = page.locator(".canvas-world");
  const original = await world.getAttribute("style");
  await page.mouse.move(600, 600);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(620, 630, { steps: 3 });
  await page.mouse.up({ button: "middle" });
  await expect(world).not.toHaveAttribute("style", original!);
  await expect(page.getByTestId("ruler-label")).toHaveCount(0);
  await page.getByTitle("Reset view", { exact: true }).click();
  const image = (await page.locator("img.node-image").boundingBox())!,
    start = { x: image.x + 20, y: image.y + 20 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const cdp = await page.context().newCDPSession(page);
  const layers = new Map<string, any>();
  cdp.on("LayerTree.layerTreeDidChange", ({ layers: current }: any) => {
    layers.clear();
    for (const layer of current ?? []) layers.set(layer.layerId, layer);
  });
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".canvas-world",
  });
  const { node } = await cdp.send("DOM.describeNode", { nodeId });
  const { nodeId: imageNodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: ".canvas-node-image",
  });
  const { node: imageNode } = await cdp.send("DOM.describeNode", {
    nodeId: imageNodeId,
  });
  await cdp.send("LayerTree.enable");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  // The zero-size world may be squashed into its children by Chrome. Identify
  // the actual image paint layer, rather than requiring a synthetic world layer.
  await expect
    .poll(() =>
      [...layers.values()].some(
        (layer) => layer.backendNodeId === imageNode.backendNodeId,
      ),
    )
    .toBe(true);
  await page.screenshot();
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    transferMode: "ReturnAsStream",
  });
  await page.mouse.move(start.x + 300, start.y + 400, { steps: 20 });
  await expect(page.getByTestId("ruler-label")).toHaveText("Owner · 5.00 m");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot();
  const finished = new Promise<any>((resolve) =>
    cdp.once("Tracing.tracingComplete", resolve),
  );
  await cdp.send("Tracing.end");
  const { stream } = await finished;
  let trace = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  const paints = JSON.parse(trace).traceEvents.filter(
    (event: any) => event.name === "Paint",
  );
  const worldLayers = [...layers.values()]
    .filter((layer) =>
      [node.backendNodeId, imageNode.backendNodeId].includes(
        layer.backendNodeId,
      ),
    )
    .map((layer) => layer.layerId);
  const imagePaints = paints.filter((event: any) =>
    [node.backendNodeId, imageNode.backendNodeId].includes(
      event.args?.data?.nodeId,
    ),
  );
  await test.info().attach("ruler-image-paints", {
    body: JSON.stringify({
      worldLayers,
      imagePaints: imagePaints.length,
      totalPaints: paints.length,
      paintNodes: paints.map((event: any) => event.args?.data),
    }),
    contentType: "application/json",
  });
  expect(worldLayers.length).toBeGreaterThan(0);
  expect(imagePaints).toHaveLength(0);
  expect(paints.length).toBeGreaterThan(0);
  await page.mouse.wheel(0, -120);
  await expect(world).not.toHaveAttribute("style", original!);
  // A plain wheel pans the camera by120px: fixed anchor → sqrt(300²+280²).
  await expect(page.getByTestId("ruler-label")).toHaveText("Owner · 4.10 m");
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("ruler-label")).toHaveText("Owner · 4.10 m");
  await page.mouse.up();
  await cdp.detach();
});
test("active ruler has a visible selected state using existing light theme tokens", async ({
  browser,
  request,
}) => {
  const page = await open(browser, request, "owner", { colorScheme: "light" });
  await page.getByTestId("ruler-tool").click();
  await page.mouse.move(500, 500);
  await expect(page.getByTestId("ruler-tool")).toHaveCSS(
    "background-color",
    "rgb(221, 247, 226)",
  );
});
test("password reader can measure in its scoped private board, identity spoof and malformed packets are not trusted", async ({
  browser,
  request,
}) => {
  const { token } = await (
    await request.get(`${api}/__test/session/password`)
  ).json();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(context);
  await context.addInitScript(
    (token) => localStorage.setItem("token", token),
    token,
  );
  const page = await context.newPage();
  await page.goto(`${web}/canvas/${privateId}`);
  await expect(page.getByTestId("ruler-tool")).toBeVisible();
  await page.getByTestId("ruler-tool").click();
  const box = (await page.locator("img.node-image").boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 420);
  await page.mouse.up();
  await expect(page.getByTestId("ruler-label")).toContainText("5.00 m");
  expect(
    (
      await request.put(`${api}/api/canvas/${privateId}/ruler-settings`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { unit: "ft", metersPerCanvasUnit: 0.1 },
      })
    ).status(),
  ).toBe(403);
  const owner = await open(browser, request, "owner"),
    socket = io(`${api}/canvas-ws`, { transports: ["websocket"] });
  try {
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    const ready = new Promise<void>((resolve) =>
      socket.once("ruler-state", () => resolve()),
    );
    socket.emit("join-canvas", { canvasId });
    await ready;
    socket.emit("ruler-update", {
      gestureId: 1,
      sequence: 1,
      start: { x: 0, y: 0 },
      end: { x: null, y: 0 },
      phase: "dragging",
    });
    await expect(owner.getByTestId("ruler-label")).toHaveCount(0);
    const received = new Promise<any>((resolve) =>
      socket.once("ruler-update", resolve),
    );
    socket.emit("ruler-update", {
      gestureId: 2,
      sequence: 1,
      start: { x: 0, y: 0, padding: "x".repeat(500000) },
      end: { x: 300, y: 400 },
      phase: "finished",
      canvasId: privateId,
      userId: "owner",
      socketId: "spoof",
      userName: "Spoof",
    });
    const measurement = await received;
    expect(measurement.socketId).toBe(socket.id);
    expect(measurement.userId).toBe(`guest:${socket.id}`);
    expect(measurement.userName).not.toBe("Spoof");
    expect(measurement.start).toEqual({ x: 0, y: 0 });
    expect(measurement.end).toEqual({ x: 300, y: 400 });
    expect(Buffer.byteLength(JSON.stringify(measurement))).toBeLessThan(512);
    await expect(owner.getByTestId("ruler-label")).toContainText("5.00 m");
  } finally {
    socket.disconnect();
  }
});

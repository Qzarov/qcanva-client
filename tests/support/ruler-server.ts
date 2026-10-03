/** Local integration fixture: real application services/controllers/gateway,
 * isolated repositories, test JWTs, no production data or network requests. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";

const backendRoot = resolve(
  process.env.RULER_TEST_BACKEND_ROOT ?? "../canvas-server-back",
);
if (!existsSync(resolve(backendRoot, "dist/canvas/canvas-ruler.service.js")))
  throw new Error(
    "Build the ruler backend and set RULER_TEST_BACKEND_ROOT explicitly.",
  );
const require = createRequire(resolve(backendRoot, "package.json"));
require("reflect-metadata");
const { CanvasGateway } = require(
  resolve(backendRoot, "dist/canvas/canvas.gateway.js"),
);
const { CanvasService } = require(
  resolve(backendRoot, "dist/canvas/canvas.service.js"),
);
const { CanvasRulerService } = require(
  resolve(backendRoot, "dist/canvas/canvas-ruler.service.js"),
);
const { CanvasController, UpdateRulerSettingsDto } = require(
  resolve(backendRoot, "dist/canvas/canvas.controller.js"),
);
const { PluginsService } = require(
  resolve(backendRoot, "dist/plugins/plugins.service.js"),
);
const { PluginsController } = require(
  resolve(backendRoot, "dist/plugins/plugins.controller.js"),
);
const express = require("express"),
  { Server } = require("socket.io"),
  jwt = require("jsonwebtoken");
const { plainToInstance } = require("class-transformer"),
  { validate } = require("class-validator");
process.env.JWT_SECRET = "local-ruler-integration-test-only";
const PORT = 3199,
  origin = `http://127.0.0.1:${PORT}`;
const canvasId = "00000000-0000-4000-8000-000000000001",
  privateId = "00000000-0000-4000-8000-000000000002";
const boards = new Map<string, any>();
let imageRequests = 0,
  contentWrites = 0;
const pluginRows = new Map<string, any>();
const key = (where: any) =>
  `${where.resourceType}:${where.resourceId}:${where.pluginId}`;
const noop = {
  findOne: async () => null,
  find: async () => [],
  create: (row: any) => ({ ...row }),
  save: async (row: any) => row,
};
const canvasRepo = {
  async findOne({ where }: any) {
    const row = where.id
      ? boards.get(where.id)
      : [...boards.values()].find((item) => item.slug === where.slug);
    return row ? structuredClone(row) : null;
  },
  create: (row: any) => ({ ...row }),
  async save(row: any) {
    const saved = { ...boards.get(row.id), ...row };
    boards.set(row.id, saved);
    contentWrites++;
    return structuredClone(saved);
  },
  async update(id: string, row: any) {
    Object.assign(boards.get(id), row);
    return { affected: 1 };
  },
};
const permissions = {
  ...noop,
  async findOne({ where }: any) {
    return ["reader", "editor"].includes(where.userId) &&
      boards.has(where.canvasId)
      ? {
          canvasId: where.canvasId,
          userId: where.userId,
          role: where.userId === "editor" ? "edit" : "read",
        }
      : null;
  },
};
const pluginsRepo = {
  findOne: async ({ where }: any) =>
    structuredClone(pluginRows.get(key(where)) ?? null),
  find: async ({ where }: any) =>
    [...pluginRows.values()].filter(
      (row) =>
        row.resourceType === where.resourceType &&
        row.resourceId === where.resourceId,
    ),
  create: (row: any) => ({ ...row }),
  save: async (row: any) => {
    pluginRows.set(key(row), structuredClone(row));
    return row;
  },
};
const telemetry = {
  record: () => {},
  recordReject: () => {},
  snapshot: () => ({}),
};
const core = new CanvasService(
  canvasRepo,
  permissions,
  noop,
  noop,
  noop,
  noop,
  telemetry,
);
const plugins = new PluginsService(pluginsRepo, canvasRepo, noop, noop);
const ruler = new CanvasRulerService(core, plugins);
const chat = { list: async () => [] };
const controller = new CanvasController(core, telemetry, noop, chat, ruler);
const pluginController = new PluginsController(plugins);
const gateway = new CanvasGateway(core, telemetry, chat, plugins, ruler);
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use((req: any, res: any, next: () => void) => {
  res.set("Access-Control-Allow-Origin", "http://127.0.0.1:4199");
  res.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: payload.sub,
        email: payload.email,
        accessMode: payload.accessMode ?? "user",
        resourceType: payload.resourceType,
        resourceId: payload.resourceId,
        resourceRole: payload.resourceRole,
      };
    } catch {
      res.status(401).json({ message: "Invalid test token" });
      return;
    }
  }
  next();
});
const http = createServer(app),
  io = new Server(http, { cors: { origin: "http://127.0.0.1:4199" } }),
  namespace = io.of("/canvas-ws");
gateway.server = namespace;
gateway.onModuleInit();
namespace.on("connection", (socket: any) => {
  gateway.handleConnection(socket);
  const handlers = {
    "join-canvas": "handleJoinCanvas",
    "leave-canvas": "handleLeaveCanvas",
    "ruler-update": "handleRulerUpdate",
    "ruler-clear": "handleRulerClear",
    "cursor-move": "handleCursorMove",
  };
  for (const [event, method] of Object.entries(handlers))
    socket.on(event, (payload: any) => {
      Promise.resolve(gateway[method](socket, payload)).catch(() =>
        socket.emit("error", { message: "Rejected fixture request" }),
      );
    });
  socket.on("disconnect", () => gateway.handleDisconnect(socket));
});
function reset() {
  namespace.disconnectSockets(true);
  boards.clear();
  pluginRows.clear();
  imageRequests = contentWrites = 0;
  for (const id of [canvasId, privateId]) {
    boards.set(id, {
      id,
      ownerId: "owner",
      owner: { id: "owner", name: "Owner", email: "owner@example.test" },
      title: "Ruler integration",
      data: JSON.stringify({
        nodes: [
          {
            id: "image",
            type: "image",
            file: `${origin}/image.svg`,
            x: 0,
            y: 0,
            width: 600,
            height: 500,
          },
          {
            id: "text",
            type: "text",
            text: "Text node",
            x: 650,
            y: 0,
            width: 200,
            height: 120,
          },
        ],
        edges: [],
      }),
      revision: 0,
      visibility: id === canvasId ? "public" : "private",
      isPublic: id === canvasId,
      allowPublicEdit: false,
      rulerUnit: "m",
      rulerMetersPerCanvasUnit: 0.01,
    });
    pluginRows.set(
      key({ resourceType: "canvas", resourceId: id, pluginId: "ruler" }),
      {
        resourceType: "canvas",
        resourceId: id,
        pluginId: "ruler",
        enabled: true,
      },
    );
  }
}
reset();
app.get("/__test/health", (_req: any, res: any) => res.json({ ok: true }));
app.post("/__test/reset", (_req: any, res: any) => {
  reset();
  res.json({ canvasId, privateId });
});
app.get("/__test/stats", (_req: any, res: any) =>
  res.json({
    imageRequests,
    contentWrites,
    revisions: [...boards.values()].map((row) => row.revision),
    sockets: [...namespace.sockets.values()].map((socket: any) => ({
      id: socket.id,
      userId: socket.userId,
      canvasId: socket.canvasId,
    })),
  }),
);
app.post("/__test/disconnect/:role", (req: any, res: any) => {
  for (const socket of namespace.sockets.values())
    if ((socket as any).userId === req.params.role) socket.conn.close();
  res.json({ ok: true });
});
app.get("/__test/session/:role", (req: any, res: any) => {
  const role = req.params.role;
  if (!["owner", "reader", "editor", "outsider", "password"].includes(role)) {
    res.status(400).end();
    return;
  }
  const payload: any = {
    sub: role,
    email: `${role}@example.test`,
    name:
      typeof req.query.name === "string"
        ? req.query.name
        : role === "owner"
          ? "Owner"
          : role === "reader"
            ? "Reader"
            : role,
    role: "user",
  };
  if (role === "password")
    Object.assign(payload, {
      accessMode: "resource-password",
      resourceType: "canvas",
      resourceId: privateId,
      resourceRole: "read",
    });
  res.json({
    token: jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" }),
    canvasId,
    privateId,
  });
});
app.get("/image.svg", (_req: any, res: any) => {
  imageRequests++;
  res
    .set("Cache-Control", "public, max-age=31536000, immutable")
    .type("image/svg+xml")
    .send(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500"><rect width="600" height="500" fill="#556677"/><circle cx="300" cy="250" r="120" fill="#a882ff"/></svg>',
    );
});
const endpoint =
  (work: (req: any) => Promise<any>) => async (req: any, res: any) => {
    try {
      res.json(await work(req));
    } catch (error: any) {
      res.status(error.getStatus?.() ?? 500).json({ message: error.message });
    }
  };
app.get(
  "/api/canvas/:id",
  endpoint((req) => controller.getOne(req.params.id, req)),
);
app.put(
  "/api/canvas/:id/ruler-settings",
  endpoint(async (req) => {
    if (!req.user) {
      const error: any = new Error("Authentication required");
      error.getStatus = () => 401;
      throw error;
    }
    const dto = plainToInstance(UpdateRulerSettingsDto, req.body);
    if ((await validate(dto)).length) {
      const error: any = new Error("Invalid ruler settings");
      error.getStatus = () => 400;
      throw error;
    }
    return controller.setRulerSettings(req.params.id, req, dto);
  }),
);
app.get(
  "/api/plugins/:resourceType/:resourceId",
  endpoint((req) => pluginController.list(req, req.params)),
);
app.put(
  "/api/plugins/:resourceType/:resourceId/:id",
  endpoint(async (req) => {
    if (!req.user || typeof req.body.enabled !== "boolean") {
      const error: any = new Error("Invalid authenticated request");
      error.getStatus = () => 401;
      throw error;
    }
    return pluginController.setEnabled(req, req.params, req.body);
  }),
);
app.get(
  "/api/canvas/:id/messages",
  endpoint((req) => controller.getMessages(req.params.id, req)),
);
app.get("/api/canvas/:id/permissions", (_req: any, res: any) => res.json([]));
app.post("/api/recent-resources/opened", (_req: any, res: any) => res.json({}));
app.get("/api/recent-resources", (_req: any, res: any) => res.json([]));
app.use("/api", (_req: any, res: any) => res.json({}));
http.listen(PORT, "127.0.0.1", () =>
  process.stdout.write(`Local ruler fixture ready at ${origin}\n`),
);
function stop() {
  gateway.onModuleDestroy();
  io.close(() => http.close(() => process.exit(0)));
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

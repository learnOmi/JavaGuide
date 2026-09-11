import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  API_PREFIX,
  EDIT_PLUGIN_VERSION,
  FILE_ROUTE,
  HEALTH_ROUTE,
  MAX_BODY_BYTES,
  MAX_MD_BYTES,
} from "./constants.js";
import { resolveSafeMdPath } from "./guard.js";

/** 允许访问编辑 API 的回环地址集合（仅本机使用，server 可能绑定在 0.0.0.0） */
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** 路由处理上下文：已解析的请求/响应与查询参数 */
interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  query: URLSearchParams;
}

/** PUT /file 请求体结构 */
interface PutFileBody {
  fp?: unknown;
  content?: unknown;
  baseMtime?: unknown;
  force?: unknown;
}

/** 输出 JSON 响应的统一出口（禁用缓存，避免代理/浏览器缓存探测结果） */
function sendJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

/** 从未知异常中提取可展示的错误信息 */
function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 读取请求体并解析为 JSON。
 * @returns 解析成功返回对象；超过体积上限返回 null（由调用方响应 413）
 */
function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let aborted = false;

    const finish = (result: Record<string, unknown> | null) => {
      if (aborted) return;
      aborted = true;
      req.removeAllListeners("data");
      req.removeAllListeners("end");
      req.removeAllListeners("error");
      resolve(result);
    };

    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => finish(null));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        finish(parsed !== null && typeof parsed === "object" ? parsed : {});
      } catch {
        finish(null);
      }
    });
  });
}

/** GET /health：健康检查，客户端据此显示/隐藏编辑入口 */
async function handleHealth({ res }: RouteContext): Promise<void> {
  sendJson(res, 200, { ok: true, version: EDIT_PLUGIN_VERSION });
}

/** GET /file?fp=：读取 Markdown 源文件，返回全文与服务端 mtime（乐观锁基准） */
async function handleGetFile({ res, query }: RouteContext): Promise<void> {
  const absolute = resolveSafeMdPath(query.get("fp"));
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    sendJson(res, 404, { ok: false, message: "文件不存在" });
    return;
  }
  const content = await fs.readFile(absolute, "utf8");
  sendJson(res, 200, { ok: true, content, mtime: stat.mtimeMs });
}

/**
 * PUT /file：写回 Markdown 源文件。
 * 以 baseMtime 做乐观锁：与服务端 mtime 不一致时返回 409 冲突，
 * 客户端可选择 force 覆盖或重新加载。
 */
async function handlePutFile({ res, req }: RouteContext): Promise<void> {
  const body = (await readJsonBody(req)) as PutFileBody | null;
  if (body === null) {
    sendJson(res, 413, { ok: false, message: "请求体超过大小限制" });
    return;
  }
  if (typeof body.content !== "string") {
    sendJson(res, 400, { ok: false, message: "content 必须为字符串" });
    return;
  }
  if (Buffer.byteLength(body.content, "utf8") > MAX_MD_BYTES) {
    sendJson(res, 413, { ok: false, message: "文件内容超过 2MB 上限" });
    return;
  }

  const absolute = resolveSafeMdPath(body.fp);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile()) {
    sendJson(res, 404, {
      ok: false,
      message: "文件不存在，可能已被移动或删除",
    });
    return;
  }

  // 乐观锁：仅当客户端明确 force 时跳过 mtime 比对
  const force = body.force === true;
  if (!force && body.baseMtime !== stat.mtimeMs) {
    sendJson(res, 409, {
      ok: false,
      conflict: true,
      message: "文件已被外部修改（可能是其他标签页或编辑器）",
      serverMtime: stat.mtimeMs,
    });
    return;
  }

  await fs.writeFile(absolute, body.content, "utf8");
  const newStat = await fs.stat(absolute);
  sendJson(res, 200, { ok: true, mtime: newStat.mtimeMs });
}

/** 路由表：`${method} ${pathname}` → 处理器 */
const ROUTES: Record<string, (ctx: RouteContext) => Promise<void>> = {
  [`GET ${HEALTH_ROUTE}`]: handleHealth,
  [`GET ${FILE_ROUTE}`]: handleGetFile,
  [`PUT ${FILE_ROUTE}`]: handlePutFile,
};

/**
 * 创建编辑 API 中间件（connect 风格）。
 * - 仅处理 /__edit/api 前缀的请求，其余交给下游（Vite/VuePress）；
 * - 前缀内所有请求先做回环地址校验，防止局域网内其他设备调用；
 * - 未匹配的路由直接返回 404 JSON，不落入 SPA fallback。
 */
export function createEditApiMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => Promise<void> {
  return async (req, res, next) => {
    const rawUrl = req.url || "";
    if (!rawUrl.startsWith(`${API_PREFIX}/`)) {
      next();
      return;
    }

    const remoteAddress = req.socket.remoteAddress || "";
    if (!LOOPBACK_ADDRESSES.has(remoteAddress)) {
      sendJson(res, 403, { ok: false, message: "编辑 API 仅限本机访问" });
      return;
    }

    const queryIndex = rawUrl.indexOf("?");
    const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
    const query = new URLSearchParams(
      queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1),
    );

    const handler =
      ROUTES[`${req.method} ${pathname.slice(API_PREFIX.length)}`];
    if (!handler) {
      sendJson(res, 404, { ok: false, message: "未知编辑 API" });
      return;
    }

    try {
      await handler({ req, res, query });
    } catch (err) {
      // 路径校验类错误返回 400，其余按 500 兜底；异常必须响应，不能悬挂连接
      const message = toErrorMessage(err);
      const status =
        message.includes("文件路径") || message.includes("仅允许") ? 400 : 500;
      sendJson(res, status, { ok: false, message });
    }
  };
}

/**
 * Native HTTP Server-Sent Events (SSE) Realtime Invalidation Bus (R-032)
 * Broadcasts lightweight invalidation events ONLY (no PII) so each connected
 * client refreshes its own role-filtered HTML fragment over authenticated endpoints.
 */

const ALLOWED_CHANNELS = new Set(["kiosk", "admin"]);
const HEARTBEAT_INTERVAL_MS = 25000;

class RealtimeService {
  constructor() {
    this.clients = new Set();
  }

  /**
   * Subscribe an authenticated HTTP response stream to SSE invalidation events.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Object} [options]
   * @param {number|null} [options.workspaceId]
   * @param {string[]} [options.channels]
   */
  subscribe(req, res, { workspaceId = null, channels = ["kiosk", "admin"] } = {}) {
    const normalizedChannels = new Set(
      (Array.isArray(channels) ? channels : ["kiosk", "admin"])
        .map((c) => String(c || "").trim().toLowerCase())
        .filter((c) => ALLOWED_CHANNELS.has(c)),
    );
    if (normalizedChannels.size === 0) {
      normalizedChannels.add("kiosk");
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable Nginx response buffering so SSE invalidation events flush immediately
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const client = {
      res,
      workspaceId: workspaceId ? Number(workspaceId) : null,
      channels: normalizedChannels,
      heartbeatTimer: null,
    };

    this.clients.add(client);

    this._safeWrite(client, `retry: 3000\nevent: connected\ndata: ${JSON.stringify({ ok: true, ts: Date.now() })}\n\n`);

    client.heartbeatTimer = setInterval(() => {
      this._safeWrite(client, `: ping ${Date.now()}\n\n`);
    }, HEARTBEAT_INTERVAL_MS);
    if (typeof client.heartbeatTimer.unref === "function") {
      client.heartbeatTimer.unref();
    }

    const cleanup = () => {
      this.unsubscribe(client);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    return client;
  }

  unsubscribe(client) {
    if (!client) return;
    if (client.heartbeatTimer) {
      clearInterval(client.heartbeatTimer);
      client.heartbeatTimer = null;
    }
    this.clients.delete(client);
  }

  /**
   * Publish a lightweight invalidation event (strictly metadata, no PII).
   *
   * @param {string} channel - "kiosk" or "admin"
   * @param {Object} [meta]
   * @param {number|null} [meta.workspaceId]
   * @param {string} [meta.action]
   * @param {string} [meta.entity]
   */
  publish(channel, meta = {}) {
    const cleanChannel = String(channel || "").trim().toLowerCase();
    if (!ALLOWED_CHANNELS.has(cleanChannel)) return 0;

    const targetWorkspaceId =
      meta && meta.workspaceId !== undefined && meta.workspaceId !== null && !Number.isNaN(Number(meta.workspaceId))
        ? Number(meta.workspaceId)
        : null;

    const safePayload = {
      channel: cleanChannel,
      workspaceId: targetWorkspaceId,
      action: meta && meta.action ? String(meta.action).slice(0, 64) : "update",
      entity: meta && meta.entity ? String(meta.entity).slice(0, 64) : cleanChannel,
      ts: Date.now(),
    };

    const frame = `event: invalidate\ndata: ${JSON.stringify(safePayload)}\n\n`;
    let delivered = 0;

    for (const client of Array.from(this.clients)) {
      if (!client.channels.has(cleanChannel)) continue;
      // Scope kiosk updates to matching workspace when both specify one
      if (
        cleanChannel === "kiosk" &&
        targetWorkspaceId !== null &&
        client.workspaceId !== null &&
        client.workspaceId !== targetWorkspaceId
      ) {
        continue;
      }
      if (this._safeWrite(client, frame)) {
        delivered++;
      }
    }

    return delivered;
  }

  _safeWrite(client, chunk) {
    try {
      if (!client || !client.res || client.res.writableEnded || client.res.destroyed) {
        this.unsubscribe(client);
        return false;
      }
      client.res.write(chunk);
      if (typeof client.res.flush === "function") {
        client.res.flush();
      }
      return true;
    } catch (_err) {
      this.unsubscribe(client);
      return false;
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  shutdown() {
    for (const client of Array.from(this.clients)) {
      this.unsubscribe(client);
      try {
        if (client.res && !client.res.writableEnded) {
          client.res.end();
        }
      } catch (_err) {
        // Ignore close errors during shutdown
      }
    }
  }
}

module.exports = new RealtimeService();
module.exports.RealtimeService = RealtimeService;
module.exports.ALLOWED_CHANNELS = ALLOWED_CHANNELS;

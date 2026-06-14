import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type CapturedRequest = {
  method: string | undefined;
  url: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string | object;
  delayMs?: number;
};

export type MockHandler = (request: CapturedRequest) => MockResponse | Promise<MockResponse>;

export type MockServer = {
  url: string;
  port: number;
  requests: CapturedRequest[];
  setHandler: (handler: MockHandler) => void;
  setResponses: (responses: MockResponse[]) => void;
  close: () => Promise<void>;
};

// Starts a local HTTP server suitable for testing fetch-based adapters.
//
// Pass a handler (per-request) or a queue of responses (consumed in order).
// Each captured request is recorded in `requests` for assertions.
export async function startMockServer(initialHandler?: MockHandler): Promise<MockServer> {
  const requests: CapturedRequest[] = [];
  let handler: MockHandler = initialHandler ?? (() => ({ status: 200, body: "ok" }));

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const captured: CapturedRequest = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf-8"),
    };
    requests.push(captured);

    const response = await handler(captured);
    if (response.delayMs && response.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    res.statusCode = response.status ?? 200;
    if (response.headers) {
      for (const [name, value] of Object.entries(response.headers)) {
        res.setHeader(name, value);
      }
    }
    if (response.body !== undefined) {
      if (typeof response.body === "string") {
        res.end(response.body);
      } else {
        if (!response.headers?.["content-type"]) {
          res.setHeader("content-type", "application/json");
        }
        res.end(JSON.stringify(response.body));
      }
    } else {
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    setHandler(next: MockHandler) {
      handler = next;
    },
    setResponses(responses: MockResponse[]) {
      let index = 0;
      handler = () => {
        const response = responses[index] ?? { status: 500, body: "unexpected request" };
        index += 1;
        return response;
      };
    },
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

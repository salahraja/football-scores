// A stand-in for the backend: serves the contract fixtures on FAKE_API_PORT (default 8787).
import { createServer } from "node:http";
import { route } from "../tests/fixtures.ts";

const port = Number(process.env.FAKE_API_PORT || 8787);

createServer((req, res) => {
  const [status, body] = route(req.url || "/");
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(port, "127.0.0.1", () => console.log(`fake api on ${port}`));

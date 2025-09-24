import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createOid4vpRequest } from './vp/requestGenerator';

const app = express();
const PORT = process.env.PORT || 20252;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Returns an OID4VP/DCQL-style presentation request JSON
app.get('/vp-request', (_req: Request, res: Response) => {
  const request = createOid4vpRequest();
  res.json(request);
});

// Simple page showing the JSON text
app.get('/', (_req: Request, res: Response) => {
  const request = createOid4vpRequest();
  const jsonText = JSON.stringify(request, null, 2)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>VP Request</title><style>body{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding:20px; background:#0b1020; color:#e6edf3} pre{white-space:pre-wrap; word-break:break-word; background:#0f152b; padding:16px; border-radius:8px; border:1px solid #1f2a44} h1{font-size:18px; margin:0 0 12px} a{color:#9cdcfe}</style></head><body><h1>OID4VP/DCQL VP Request</h1><pre>${jsonText}</pre><p>API: <a href="/vp-request">/vp-request</a></p></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Metaverse service running on http://localhost:${PORT}`);
});



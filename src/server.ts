import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Connection,
  PublicKey,
  LogsCallback,
} from '@solana/web3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);

const RPC =
  process.env.SOLANA_HTTP_RPC ||
  'https://api.mainnet-beta.solana.com';

const connection = new Connection(RPC, 'confirmed');

const watchedWallets = new Set<string>();
const events: any[] = [];

function addEvent(data: any) {
  events.unshift({
    id: Date.now(),
    time: new Date().toISOString(),
    ...data
  });

  if (events.length > 100) {
    events.pop();
  }
}

async function watchWallet(wallet: string) {
  if (watchedWallets.has(wallet)) return;

  const publicKey = new PublicKey(wallet);

  watchedWallets.add(wallet);

  const callback: LogsCallback = (logs, context) => {
    addEvent({
      type: 'TX',
      wallet,
      signature: logs.signature,
      slot: context.slot,
      err: logs.err
    });
  };

  await connection.onLogs(publicKey, callback, 'confirmed');

  addEvent({
    type: 'WATCH',
    wallet
  });
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    mode: process.env.TRADING_MODE || 'PAPER',
    watchedWallets: [...watchedWallets],
    events: events.length
  });
});

app.get('/events', (_req, res) => {
  res.json(events);
});

app.get('/watch', (_req, res) => {
  res.json([...watchedWallets]);
});

app.post('/watch', async (req, res) => {
  try {
    const wallet = String(req.body.wallet || '').trim();

    if (!wallet) {
      return res.status(400).json({
        error: 'wallet is required'
      });
    }

    await watchWallet(wallet);

    res.json({
      ok: true,
      wallet
    });
  } catch (error: any) {
    res.status(400).json({
      error: error?.message || 'invalid wallet'
    });
  }
});

app.delete('/watch/:wallet', (req, res) => {
  watchedWallets.delete(req.params.wallet);

  res.json({
    ok: true
  });
});

const publicDir = path.join(__dirname, '../public');

app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Solana CopyTrade running on port ${PORT}`);
  console.log(`Mode: ${process.env.TRADING_MODE || 'PAPER'}`);
});

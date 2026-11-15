// A stand-in for Decaid on port 8080, for testing the skin's real network
// code without a machine. Wraps the same simulator the demo mode uses.
// Not shipped in the skin ZIP.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createSim } from '../skin/src/sim.js';

const sim = createSim({ ghc: process.env.GHC !== '0' });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  if (req.url === '/__test/timer') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(sim.timerLog)); return;
  }
  if (req.url.startsWith('/__test/press/')) {
    sim.press(req.url.split('/').pop());
    res.writeHead(200, cors); res.end(); return;
  }
  try {
    const data = await sim.request(req.method, req.url, body);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(data === null || data === undefined ? '' : JSON.stringify(data));
  } catch (error) {
    res.writeHead(error.status || 500, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const close = sim.stream(req.url, (message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); });
    ws.on('close', close);
  });
});

server.listen(Number(process.env.PORT) || 8080, () => console.log('mock gateway on', server.address().port));

// socolive.js — uses static JSON endpoints (CDN-served, no IP block)
const https = require('https');

const BASE = 'https://json.vnres.co';

const HEADERS = {
  'Accept':           'application/json, */*',
  'Accept-Encoding':  'gzip, deflate, br',
  'Accept-Language':  'en-GB,en-US;q=0.9',
  'Origin':           'https://m.socoliveff01.com',
  'Referer':          'https://m.socoliveff01.com/',
  'User-Agent':       'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
};

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'GET', headers: HEADERS },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} from Socolive`));
          }
          try { resolve(JSON.parse(body)); }
          catch { resolve(body); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// All live rooms — cache-bust with timestamp
const allRooms = () => get(`/all_live_rooms.json?t=${Date.now()}`);

// Single room detail by room number
const roomDetail = (roomNum) => get(`/room/${roomNum}/detail.json`);

module.exports = { allRooms, roomDetail };

/* Whiteboard: browsers talking straight to each other (WebRTC), for live boards.

   Finding each other ("signalling") goes through public WebTorrent trackers: free, no account,
   and several at once, so one being down doesn't matter. A tracker only ever sees
     - a hash of the room (SHA-1 of the room code), never the code itself, and
     - the connection offers and answers, encrypted with a key made from the room code (AES-GCM),
       so it can't read the network addresses inside them either.
   STUN servers (Google, Cloudflare) tell each browser its public address so they can reach each
   other through home routers. After that, everything goes over an encrypted (DTLS) data channel
   directly between the browsers; the trackers aren't needed any more. With more than two people,
   everyone connects to everyone (fine for a handful of people).
   Some networks block direct connections; a TURN relay of the user's own (in Settings) gets
   through those. None is built in: a password in public code would be anyone's to use up.

   WB.p2p.join(room, { ice, onPeer(id), onLeave(id), onMessage(id, msg), onStatus(st) }) -> room
     room.send(msg, to?)   a JSON-able message to one peer, or to all of them
     room.leave()
   Messages of any size: long ones are cut into pieces and put together again on arrival. */
(function () {
  const WB = window.WB;
  const TRACKERS = ['wss://tracker.openwebtorrent.com', 'wss://tracker.webtorrent.dev', 'wss://tracker.files.fm:7073/announce'];
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const OFFERS = 5;            // ready-made offers handed to each tracker, for that many newcomers
  const ANNOUNCE_MS = 30000;   // re-announce (with fresh offers) this often
  const CONNECT_MS = 15000;    // give a connection this long to open
  const MAX_PEERS = 12;
  const PIECE = 16000;         // characters per data channel message (safe in every browser)

  const enc = new TextEncoder(), dec = new TextDecoder();
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const bin = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; };
  const hex = (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const b64 = (bytes) => btoa(bin(bytes));
  const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

  async function roomKeys(room) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode('whiteboard-room:' + room)));
    const raw = await crypto.subtle.digest('SHA-256', enc.encode('whiteboard-key:' + room));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { infoHash: bin(hash), key };
  }
  async function seal(key, text) {
    const iv = rand(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64(out);
  }
  async function unseal(key, t) {
    const all = unb64(t);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, key, all.subarray(12)));
  }
  /* Wait until the connection knows all its addresses (the trackers carry one offer, no updates). */
  const gathered = (pc) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 4000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });

  async function join(room, h) {
    const { infoHash, key } = await roomKeys(room);
    const myId = bin(rand(20)), me = hex(myId);
    const ice = { iceServers: STUN.concat(h.ice || []) };
    const peers = new Map();        // peer id (hex) -> { pc, dc, offerer, open, timer, parts }
    let offers = new Map();         // offer id -> { pc, dc }  (this round's, not yet answered)
    let left = false, others = false, failed = 0;
    const sockets = [];

    const status = () => {
      if (left) return;
      let open = 0, connecting = 0;
      for (const p of peers.values()) if (p.open) open++; else connecting++;
      h.onStatus({ me, peers: open, connecting, trackers: sockets.filter((s) => s.ws && s.ws.readyState === 1).length, others, failed });
    };

    /* ---- One peer ---- */
    function bindChannel(id, p, dc) {
      p.dc = dc;
      dc.bufferedAmountLowThreshold = 256 * 1024;
      dc.onopen = () => {
        if (peers.get(id) !== p || left) return dc.close();
        p.open = true; clearTimeout(p.timer); failed = 0;
        h.onPeer(id); status();
      };
      dc.onclose = () => drop(id, p);
      dc.onmessage = (e) => receive(id, p, e.data);
      dc.onbufferedamountlow = () => pump(p);
    }
    /* Keep at most one connection per peer. When two appear at once (each answered the other's
       offer), both sides keep the one offered by the smaller id, so they keep the same one. */
    function register(id, pc, offerer) {
      const old = peers.get(id);
      if (old) {
        if (old.offerer <= offerer) { pc.close(); return null; }
        drop(id, old, true);
      }
      if (peers.size >= MAX_PEERS) { pc.close(); return null; }
      const p = { pc, dc: null, offerer, open: false, queue: [], parts: new Map() };
      p.timer = setTimeout(() => { if (!p.open) { failed++; drop(id, p); } }, CONNECT_MS);
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (!p.open) failed++; drop(id, p); } };
      peers.set(id, p);
      status();
      return p;
    }
    function drop(id, p, quiet) {
      if (peers.get(id) !== p) return;
      peers.delete(id);
      clearTimeout(p.timer);
      try { p.dc && p.dc.close(); } catch (e) {}
      try { p.pc.close(); } catch (e) {}
      if (p.open && !quiet) h.onLeave(id);
      status();
    }

    /* ---- Messages ---- */
    let msgNo = 0;
    function send(msg, to) {
      const text = JSON.stringify(msg);
      const chunks = [];
      if (text.length <= PIECE) chunks.push(text);
      else {
        const n = Math.ceil(text.length / PIECE), tag = (++msgNo).toString(36);
        for (let i = 0; i < n; i++) chunks.push('\u0001' + tag + ':' + i + ':' + n + ':' + text.slice(i * PIECE, (i + 1) * PIECE));
      }
      for (const [id, p] of peers) {
        if (!p.open || (to && to !== id)) continue;
        p.queue.push(...chunks);
        pump(p);
      }
    }
    function pump(p) {
      const dc = p.dc;
      while (p.queue.length && dc && dc.readyState === 'open' && dc.bufferedAmount < 1024 * 1024) {
        try { dc.send(p.queue.shift()); } catch (e) { return; }
      }
    }
    function receive(id, p, data) {
      if (typeof data !== 'string') return;
      if (data.charCodeAt(0) === 1) {
        const a = data.indexOf(':'), b = data.indexOf(':', a + 1), c = data.indexOf(':', b + 1);
        const tag = data.slice(1, a), i = +data.slice(a + 1, b), n = +data.slice(b + 1, c);
        if (!(n > 0 && n < 100000 && i >= 0 && i < n)) return;
        let m = p.parts.get(tag);
        if (!m) { if (p.parts.size > 8) return; m = { n, got: 0, list: new Array(n) }; p.parts.set(tag, m); }
        if (m.list[i] == null) { m.list[i] = data.slice(c + 1); m.got++; }
        if (m.n >= 4 && h.onProgress) h.onProgress(id, m.got, m.n);    // a big message on its way (a whole board, a picture)
        if (m.got < m.n) return;
        p.parts.delete(tag);
        data = m.list.join('');
      }
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }
      if (msg && typeof msg === 'object') { try { h.onMessage(id, msg); } catch (e) { console.error('live message', e); } }
    }

    /* ---- Trackers ---- */
    async function makeOffers() {
      for (const o of offers.values()) if (!o.taken) try { o.pc.close(); } catch (e) {}
      const round = new Map();
      offers = round;
      await Promise.all(Array.from({ length: OFFERS }, async () => {
        const pc = new RTCPeerConnection(ice), dc = pc.createDataChannel('wb', { ordered: true });
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        round.set(bin(rand(20)), { pc, dc, sdp: await seal(key, pc.localDescription.sdp) });
      }));
      return round;
    }
    let round = null;
    async function announce(s, first) {
      if (left || !s.ws || s.ws.readyState !== 1) return;
      const list = [...(await round).entries()].filter(([, o]) => !o.taken);
      if (left || s.ws.readyState !== 1) return;
      s.ws.send(JSON.stringify({ action: 'announce', info_hash: infoHash, peer_id: myId, numwant: OFFERS, uploaded: 0, downloaded: 0, left: 1,
        event: first ? 'started' : undefined, offers: list.map(([offer_id, o]) => ({ offer_id, offer: { type: 'offer', sdp: o.sdp } })) }));
    }
    async function onOffer(s, m) {
      const id = hex(m.peer_id);
      if (id === me || (peers.get(id) && peers.get(id).offerer <= id)) return;   // already have (or are making) a connection with them
      let sdp;
      try { sdp = await unseal(key, m.offer.sdp); } catch (e) { return; }
      const pc = new RTCPeerConnection(ice), p = register(id, pc, id);
      if (!p) return;
      pc.ondatachannel = (e) => bindChannel(id, p, e.channel);
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        if (left || peers.get(id) !== p || s.ws.readyState !== 1) return;
        s.ws.send(JSON.stringify({ action: 'announce', info_hash: infoHash, peer_id: myId, to_peer_id: m.peer_id, offer_id: m.offer_id,
          answer: { type: 'answer', sdp: await seal(key, pc.localDescription.sdp) } }));
      } catch (e) { drop(id, p, true); }
    }
    async function onAnswer(m) {
      const o = offers.get(m.offer_id), id = hex(m.peer_id);
      if (!o || o.taken || id === me) return;
      let sdp;
      try { sdp = await unseal(key, m.answer.sdp); } catch (e) { return; }
      if (o.taken) return;
      o.taken = true;
      const p = register(id, o.pc, me);
      if (!p) return;
      bindChannel(id, p, o.dc);
      try { await o.pc.setRemoteDescription({ type: 'answer', sdp }); } catch (e) { drop(id, p, true); }
    }
    function tracker(url) {
      const s = { url, ws: null, retry: 0 };
      const connect = () => {
        if (left) return;
        try { s.ws = new WebSocket(url); } catch (e) { return; }
        s.ws.onopen = () => { s.retry = 0; status(); announce(s, true); };
        s.ws.onmessage = (e) => {
          let m;
          try { m = JSON.parse(e.data); } catch (err) { return; }
          if (!m || m.info_hash !== infoHash || m.peer_id === myId) return;
          if ((m.complete || 0) + (m.incomplete || 0) > 1 && !others) { others = true; status(); }
          if (m.offer && m.offer_id && typeof m.offer.sdp === 'string') onOffer(s, m);
          else if (m.answer && m.offer_id && typeof m.answer.sdp === 'string') onAnswer(m);
        };
        s.ws.onclose = () => { status(); if (!left) setTimeout(connect, Math.min(60000, 3000 * 2 ** s.retry++)); };
        s.ws.onerror = () => {};
      };
      connect();
      return s;
    }

    round = makeOffers();
    for (const url of TRACKERS) sockets.push(tracker(url));
    const tick = setInterval(() => { round = makeOffers(); for (const s of sockets) announce(s, false); }, ANNOUNCE_MS);
    status();

    return {
      me,
      send,
      leave() {
        if (left) return;
        clearInterval(tick);
        for (const s of sockets) {
          try {
            if (s.ws.readyState === 1) s.ws.send(JSON.stringify({ action: 'announce', info_hash: infoHash, peer_id: myId, numwant: 0, uploaded: 0, downloaded: 0, left: 1, event: 'stopped' }));
            s.ws.close();
          } catch (e) {}
        }
        left = true;
        for (const [id, p] of [...peers]) drop(id, p, true);
        Promise.resolve(round).then((r) => { for (const o of r.values()) if (!o.taken) try { o.pc.close(); } catch (e) {} });
      },
    };
  }

  /* A new room code, easy to read out and type: 8 characters like K7QM-4XHC, from letters and
     digits that can't be mistaken for each other (no 0/O, 1/I/L). About 40 random bits: far too
     many rooms to find one by trying. */
  const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newRoom() {
    let s = '';
    while (s.length < 8) for (const b of rand(16)) if (b < 248 && s.length < 8) s += CODE[b % 31];   // (248 = 8 × 31: no bias)
    return s.slice(0, 4) + '-' + s.slice(4);
  }
  /* A room code as typed or found in a link -> the room, or null. Short codes are forgiving about
     case, spaces and dashes; the longer codes of earlier versions are taken as they are. */
  function roomOf(text) {
    const t = String(text || '').trim(), short = t.toUpperCase().replace(/[\s-]+/g, '');
    if (short.length === 8 && [...short].every((c) => CODE.includes(c))) return short.slice(0, 4) + '-' + short.slice(4);
    return /^[A-Za-z0-9_-]{12,64}$/.test(t) ? t : null;
  }

  WB.p2p = { join, newRoom, roomOf, supported: typeof RTCPeerConnection === 'function' && !!(window.crypto && crypto.subtle) };
})();

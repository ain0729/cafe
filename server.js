const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual} = require('node:crypto');
const {promisify} = require('node:util');
const {createStore,fail} = require('./store');
const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');
function createApp(options={}) {
  const env=options.env || process.env;
  const origin=new URL(env.BASE_URL || 'http://localhost:3000').origin;
  const secure=origin.startsWith('https:');
  const client=env.TOSS_CLIENT_KEY || '', secret=env.TOSS_SECRET_KEY || '';
  const testKeys=client.startsWith('test_ck_') && secret.startsWith('test_sk_');
  const liveKeys=client.startsWith('live_ck_') && secret.startsWith('live_sk_');
  const configured=Boolean(testKeys || (liveKeys && secure && env.ALLOW_LIVE_PAYMENTS==='true'));
  const dataDir=path.join(__dirname,'data');
  if (!options.dbFile) fs.mkdirSync(dataDir,{recursive:true});
  const store=createStore(options.dbFile || path.join(dataDir,'cafe.sqlite'));
  const adminEmail=(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const attempts=new Map(), locks=new Set();
  const authBusy={count:0};
  function throttle(key,limit=20) {
    const now=Date.now();
    if (attempts.size>10000) { for (const [k,v] of attempts) if (v.until<now) attempts.delete(k); }
    let entry=attempts.get(key);
    if (!entry || entry.until<now) { entry={count:0,until:now+15*60*1000}; attempts.set(key,entry); }
    if (++entry.count>limit) fail('요청이 많습니다. 15분 후 다시 시도해주세요.',429);
  }
  const userView=user=>({id:user.id,name:user.name,email:user.email,stamps:store.balance(user.id),admin:Boolean(adminEmail && user.email===adminEmail)});
  function getUser(req) {
    const token=(req.headers.cookie || '').match(/(?:^|;\s*)cafe_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (!token) return null;
    return store.q('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hash(token),Date.now()) || null;
  }
  function session(res,user) {
    const token=randomBytes(32).toString('hex');
    store.q('DELETE FROM sessions WHERE expires<?').run(Date.now());
    store.q('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+7*86400000);
    res.setHeader('Set-Cookie',`cafe_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure?'; Secure':''}`);
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) fail('JSON 요청이 필요합니다.',415);
    const chunks=[];let length=0;
    for await (const part of req) { length+=part.length; if (length>32768) fail('요청이 너무 큽니다.',413); chunks.push(part); }
    const value=Buffer.concat(chunks).toString('utf8');
    try { const result=JSON.parse(value); if (!result || Array.isArray(result) || typeof result!=='object') fail('잘못된 요청입니다.'); return result; } catch { fail('요청 형식을 확인해주세요.'); }
  }
  async function gateway(method,endpoint,payload,key) {
    const response=await (options.paymentFetch || fetch)('https://api.tosspayments.com/v1/payments'+endpoint,{
      method, headers:{Authorization:'Basic '+Buffer.from(secret+':').toString('base64'),'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json();
    if (!response.ok) fail('결제사 확인이 필요합니다. 주문 내역에서 결제 상태를 다시 확인해주세요.',502);
    return result;
  }
  const lookup=order=>gateway('GET','/orders/'+encodeURIComponent(order.id));
  async function locked(id,fn) { if (locks.has(id)) fail('주문을 처리 중입니다. 잠시 후 다시 확인해주세요.',409); locks.add(id); try { return await fn(); } finally { locks.delete(id); } }
  function json(res,value,status=200) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
  const staticFiles={'/images/interior-counter-clean.png':'images/interior-counter-clean.png','/images/interior-tables-clean.png':'images/interior-tables-clean.png','/complete.html':'complete.html','/orders.html':'orders.html','/space.html':'space.html',"/images/%EC%B9%B4%ED%8E%98%20%EB%82%B4%EB%B6%80%201.png":"images/카페 내부 1.png","/images/%EC%B9%B4%ED%8E%98%20%EB%82%B4%EB%B6%80%202.png":"images/카페 내부 2.png","/images/%EC%B9%B4%ED%8E%98%20%EB%82%B4%EB%B6%80%203.png":"images/카페 내부 3.png",'/cart.html':'cart.html','/order.html':'order.html','/login.html':'login.html','/signup.html':'signup.html','/membership.html':'membership.html','/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/menu.js':'menu.js','/commerce.js':'commerce.js','/commerce.css':'commerce.css','/admin':'admin.html','/admin.js':'admin.js'};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    try {
      const url=new URL(req.url,'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method!=='GET' && req.method!=='HEAD') fail('허용되지 않은 요청입니다.',405);
        const filename=staticFiles[url.pathname]; if (!filename) fail('페이지를 찾을 수 없습니다.',404);
        res.setHeader('Content-Type',filename.endsWith('.png')?'image/png':filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
        res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(__dirname,'public',filename))); return;
      }
      if (!['GET','POST'].includes(req.method)) fail('허용되지 않은 요청입니다.',405);
      if (req.method==='POST') {
        if (req.headers.origin!==origin || req.headers['x-cafe-request']!=='1') fail('허용되지 않은 출처입니다.',403);
        throttle('write:'+req.socket.remoteAddress,300);
      }
      const route=req.method+' '+url.pathname;
      if (route==='GET /api/config') return json(res,{configured,clientKey:configured?client:null,mode:configured?(testKeys?'test':'live'):'unconfigured'});
      if (route==='GET /api/menu') return json(res,store.catalog);
      const user=getUser(req);
      if (route==='GET /api/me') return json(res,{user:user?userView(user):null});
      if (route==='POST /api/signup' || route==='POST /api/login') {
        throttle('auth:'+req.socket.remoteAddress,20);
        const input=await body(req);
        const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
        const password=input.password;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || typeof password!=='string' || password.length<10 || password.length>128) fail('이메일과 10~128자 비밀번호를 입력해주세요.');
        throttle('email:'+email,15);
        if (authBusy.count>=4) fail('로그인 요청을 처리 중입니다. 다시 시도해주세요.',429);
        let account;
        authBusy.count++;
        try {
          if (route==='POST /api/signup') {
            const name=typeof input.name==='string'?input.name.trim():'';
            if (!name || name.length>30) fail('이름은 1~30자로 입력해주세요.');
            const salt=randomBytes(16).toString('hex');
            const passwordHash=(await scrypt(password,salt,64)).toString('hex');
            const id=randomUUID();
            try { store.q('INSERT INTO users VALUES(?,?,?,?,?)').run(id,email,name,salt+':'+passwordHash,new Date().toISOString()); }
            catch (error) { if (error.code?.startsWith('ERR_SQLITE') && store.q('SELECT id FROM users WHERE email=?').get(email)) fail('이미 가입된 이메일입니다.',409); throw error; }
            account=store.q('SELECT * FROM users WHERE id=?').get(id);
          } else {
            account=store.q('SELECT * FROM users WHERE email=?').get(email);
            const [salt,expected]=(account?.password || 'unregistered:'+ '0'.repeat(128)).split(':');
            const actual=await scrypt(password,salt,64);
            if (!account || !timingSafeEqual(Buffer.from(expected,'hex'),actual)) fail('이메일 또는 비밀번호를 확인해주세요.',401);
          }
        } finally { authBusy.count--; }
        session(res,account); return json(res,{user:userView(account)});
      }
      if (!user) fail('로그인이 필요합니다.',401);
      if (route==='POST /api/logout') {
        const token=(req.headers.cookie || '').match(/cafe_session=([a-f0-9]{64})/)?.[1];
        if (token) store.q('DELETE FROM sessions WHERE token=?').run(hash(token));
        res.setHeader('Set-Cookie',`cafe_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure?'; Secure':''}`);
        return json(res,{ok:true});
      }
      const orderLookup=url.pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)$/);
      if(req.method==='GET'&&orderLookup)return json(res,store.serialize(store.ownOrder(orderLookup[1],user.id)));
      if (route==='GET /api/orders') return json(res,store.q('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 100').all(user.id).map(store.serialize));
      if (route==='GET /api/coupons') return json(res,store.coupons(user.id));
      if (route==='GET /api/stamps') return json(res,{balance:store.balance(user.id),history:store.q('SELECT order_id,kind,delta,created FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 100').all(user.id)});
      if (route==='POST /api/orders') {
        if (!configured) fail('카드 결제 설정이 아직 완료되지 않았습니다.',503);
        const input=await body(req);
        const order=store.createOrder(user.id,input.requestKey,input.items);
        return json(res,{order:store.serialize(order),customerKey:user.id});
      }
      if (route==='POST /api/redeem') {
        const input=await body(req); return json(res,{order:store.serialize(store.redeem(user.id,input.requestKey,input.temperature)),user:userView(user)});
      }
      const match=url.pathname.match(/^\/api\/orders\/([a-zA-Z0-9-]+)\/(confirm|sync|cancel|fulfillment)$/);
      const isAdmin=Boolean(adminEmail && user.email===adminEmail);
      if (route==='GET /api/admin/orders') {
        if (!isAdmin) fail('관리자 권한이 필요합니다.',403);
        return json(res,store.q('SELECT o.*,u.name AS customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created DESC LIMIT 200').all().map(o=>({...store.serialize(o),customerName:o.customer_name})));
      }
      if (req.method==='POST' && match) {
        const [,id,action]=match;
        const order=isAdmin && action!=='confirm'?store.getOrder(id):store.ownOrder(id,user.id);
        if (!order) fail('주문을 찾을 수 없습니다.',404);
        const input=await body(req);
        if (action==='fulfillment') {
          if (!isAdmin) fail('관리자 권한이 필요합니다.',403);
          store.setFulfillment(id,input.status);
          return json(res,{order:store.serialize(store.getOrder(id))});
        }
        if (action==='cancel' && !isAdmin) fail('결제 취소는 매장에 요청해주세요.',403);
        if (action==='cancel' && order.kind==='reward') return json(res,{order:store.serialize(store.cancelReward(id))});
        if (order.kind!=='card' || !configured) fail('카드 결제 설정 또는 주문을 확인해주세요.',503);
        return await locked(id,async()=>{
          let payment;
          if (action==='confirm') {
            if (typeof input.paymentKey!=='string' || !input.paymentKey.length || input.paymentKey.length>200 || input.amount!==order.amount) fail('결제 금액 또는 결제 식별자가 올바르지 않습니다.');
            if (order.payment_key && order.payment_key!==input.paymentKey) fail('결제 식별자가 다릅니다.',409);
            if (order.status==='canceled' || order.status==='partial_canceled' || order.status==='failed') fail('완료할 수 없는 주문입니다.',409);
            if (order.status==='paid') return json(res,{order:store.serialize(order),user:userView(user)});
            store.q("UPDATE orders SET status='confirming',payment_key=? WHERE id=?").run(input.paymentKey,id);
            try { payment=await gateway('POST','/confirm',{paymentKey:input.paymentKey,orderId:id,amount:order.amount},id); }
            catch { payment=await lookup(order); }
          } else if (action==='sync') payment=await lookup(order);
          else {
            if (order.status==='canceled') return json(res,{order:store.serialize(order)});
            // 먼저 결제사를 조회하여 서버 중단·외부 취소 후의 상태도 복구한다.
            payment=await lookup(order);
            store.applyPayment(id,payment);
            if (payment.status==='CANCELED') return json(res,{order:store.serialize(store.getOrder(id))});
            if (payment.status!=='DONE') fail('취소할 수 있는 결제 완료 주문이 아닙니다.',409);
            store.q("UPDATE orders SET status='cancelling' WHERE id=?").run(id);
            try { payment=await gateway('POST','/'+encodeURIComponent(payment.paymentKey)+'/cancel',{cancelReason:'고객 요청에 따른 전체 주문 취소'},'cancel_'+id); }
            catch { payment=await lookup(order); }
          }
          const updated=store.applyPayment(id,payment);
          if (action==='confirm' && updated.status!=='paid') fail('결제가 완료되지 않았습니다. 주문 상태를 확인해주세요.',409);
          if (action==='cancel' && updated.status!=='canceled') fail('취소 결과를 확인 중입니다. 결제 상태를 다시 확인해주세요.',502);
          return json(res,{order:store.serialize(updated),user:userView(user)});
        });
      }
      fail('요청을 찾을 수 없습니다.',404);
    } catch(error) {
      if (res.headersSent) { res.end(); return; }
      if (!error.status) console.error('Server error:',error.message);
      json(res,{error:error.status?error.message:'서버 처리 중 문제가 발생했습니다. 다시 시도해주세요.'},error.status || 500);
    }
  });
  server.requestTimeout=20000;
  server.headersTimeout=10000;
  return {server,store,origin};
}
if (require.main===module) {
  const app=createApp();
  const port=Number(process.env.PORT || 3000);
  app.server.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`CAFE: ${app.origin}\n이 창을 열어두세요. 종료: Ctrl+C`));
}
module.exports={createApp};



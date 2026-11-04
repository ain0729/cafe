const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'public', 'menu.js'), 'utf8') + ';globalThis.catalog=menu', context);
const catalog = JSON.parse(JSON.stringify(context.catalog)).map((group, g) => ({
  ...group, items: group.items.map((item, i) => ({ ...item, id: `${g}-${i}`, category: group.category }))
}));
const items = catalog.flatMap(g => g.items);
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function createStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,kind TEXT NOT NULL,items TEXT NOT NULL,amount INTEGER NOT NULL,stamps INTEGER NOT NULL,status TEXT NOT NULL,fulfillment TEXT NOT NULL DEFAULT 'received',payment_key TEXT UNIQUE,created TEXT NOT NULL,UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,delta INTEGER NOT NULL,created TEXT NOT NULL,UNIQUE(order_id,kind));`);
  const q = sql => db.prepare(sql);
  function tx(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } }
  const balance = id => q('SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE user_id=?').get(id).n;
  const getOrder = id => q('SELECT * FROM orders WHERE id=?').get(id);
  function ownOrder(id, userId) { const order = getOrder(id); if (!order || order.user_id !== userId) fail('주문을 찾을 수 없습니다.', 404); return order; }
  function price(lines) {
    if (!Array.isArray(lines) || !lines.length || lines.length > 30) fail('장바구니를 확인해주세요.');
    let amount = 0, stamps = 0, count = 0;
    const priced = lines.map(line => {
      if (!line || typeof line !== 'object') fail('메뉴를 확인해주세요.');
      const item = items.find(i => i.id === line.id);
      if (!item || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 30) fail('메뉴 또는 수량이 올바르지 않습니다.');
      if (item.options ? !item.options.includes(line.temperature) : Boolean(line.temperature)) fail('온도 옵션을 확인해주세요.');
      if (!['regular', 'large'].includes(line.size) || (line.size === 'large' && !item.largePrice)) fail('사이즈를 확인해주세요.');
      const unitPrice = line.size === 'large' ? item.largePrice : item.price;
      amount += unitPrice * line.quantity;
      count += line.quantity;
      if (item.category !== 'DESSERT') stamps += line.quantity;
      return {id:item.id,name:item.name,quantity:line.quantity,temperature:line.temperature || '',size:line.size,unitPrice};
    });
    if (count > 50) fail('한 주문에는 최대 50개까지 담을 수 있습니다.');
    return {items:priced,amount,stamps};
  }
  function insertOrder(userId, key, kind, data, status) {
    const id = randomUUID();
    q('INSERT INTO orders(id,user_id,request_key,kind,items,amount,stamps,status,created) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,userId,key,kind,JSON.stringify(data.items),data.amount,data.stamps,status,new Date().toISOString());
    return getOrder(id);
  }
  function checkKey(key) { if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) fail('주문 요청 번호가 올바르지 않습니다.'); }
  function previous(userId, key, kind) {
    const order=q('SELECT * FROM orders WHERE user_id=? AND request_key=?').get(userId,key);
    if (order && order.kind !== kind) fail('이미 사용한 주문 요청 번호입니다.',409);
    return order;
  }
  const entry = (order, kind, delta) => q('INSERT OR IGNORE INTO ledger(user_id,order_id,kind,delta,created) VALUES(?,?,?,?,?)').run(order.user_id,order.id,kind,delta,new Date().toISOString());
  function createOrder(userId, key, lines) {
    checkKey(key);
    return tx(() => previous(userId,key,'card') || insertOrder(userId,key,'card',price(lines),'pending'));
  }
  function redeem(userId, key, temperature) {
    checkKey(key);
    if (!['HOT','ICE'].includes(temperature)) fail('HOT 또는 ICE를 선택해주세요.');
    return tx(() => {
      const existing = previous(userId,key,'reward'); if (existing) return existing;
      if (balance(userId) < 10) fail('스탬프 10개가 필요합니다.',409);
      const order = insertOrder(userId,key,'reward',{items:[{id:'0-0',name:'아메리카노 (스탬프 교환)',quantity:1,temperature,size:'regular',unitPrice:0}],amount:0,stamps:0},'paid');
      entry(order,'redeem',-10);
      return order;
    });
  }
  function applyPayment(orderId, payment) {
    return tx(() => {
      const order = getOrder(orderId);
      if (!order || order.kind !== 'card' || payment.orderId !== order.id || payment.totalAmount !== order.amount || payment.currency !== 'KRW' || typeof payment.paymentKey !== 'string' || !payment.paymentKey.length || payment.paymentKey.length > 200) fail('결제 정보가 주문과 일치하지 않습니다.',409);
      if (order.payment_key && order.payment_key !== payment.paymentKey) fail('결제 식별자가 일치하지 않습니다.',409);
      if (payment.status === 'DONE') {
        if (order.status === 'canceled') fail('이미 취소된 주문입니다.',409);
        entry(order,'earn',order.stamps);
        q("UPDATE orders SET status='paid',payment_key=? WHERE id=?").run(payment.paymentKey,order.id);
      } else if (payment.status === 'CANCELED') {
        // 승인 후 서버가 중단됐어도 거래 원장에 적립과 회수를 한 번씩 기록한다.
        entry(order,'earn',order.stamps); entry(order,'reverse',-order.stamps);
        q("UPDATE orders SET status='canceled',payment_key=? WHERE id=?").run(payment.paymentKey,order.id);
      } else if (payment.status === 'PARTIAL_CANCELED') {
        // shortcut: 외부 부분취소는 전액 스탬프 회수, 부분취소 UI 도입 시 비례 정책 필요.
        entry(order,'earn',order.stamps); entry(order,'reverse',-order.stamps);
        q("UPDATE orders SET status='partial_canceled',payment_key=? WHERE id=?").run(payment.paymentKey,order.id);
      } else if (['ABORTED','EXPIRED'].includes(payment.status)) {
        if (['pending','confirming'].includes(order.status)) q("UPDATE orders SET status='failed' WHERE id=?").run(order.id);
      }
      return getOrder(order.id);
    });
  }
  function cancelReward(id) {
    return tx(() => { const order=getOrder(id); if (!order || order.kind!=='reward') fail('교환 주문을 확인해주세요.');
      if (order.status!=='canceled') { entry(order,'return',10); q("UPDATE orders SET status='canceled' WHERE id=?").run(id); }
      return getOrder(id);
    });
  }
  const serialize = order => ({id:order.id,kind:order.kind,items:JSON.parse(order.items),amount:order.amount,stamps:order.stamps,status:order.status,fulfillment:order.fulfillment,created:order.created});
  return {db,q,tx,balance,getOrder,ownOrder,price,createOrder,redeem,applyPayment,cancelReward,serialize,catalog,close:()=>db.close()};
}
module.exports = {createStore,fail};


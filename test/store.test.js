const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../store');
const {randomUUID}=require('node:crypto');
function fixture(t) {const s=createStore(':memory:');t.after(()=>s.close());s.q('INSERT INTO users VALUES(?,?,?,?,?)').run('user','test@example.com','test','hash','now');return s;}
const line=(quantity=1,id='0-0')=>({id,quantity,temperature:id.startsWith('5-')?'':'ICE',size:'regular'});
const payment=(order,status='DONE')=>({orderId:order.id,paymentKey:'payment_'+order.id,totalAmount:order.amount,currency:'KRW',status});
function paid(s,count=10) {const order=s.createOrder('user',randomUUID(),[line(count)]);return s.applyPayment(order.id,payment(order));}
test('6 categories, 22 items; server ignores browser price and calculates sizes',t=>{
 const s=fixture(t);assert.equal(s.catalog.length,6);assert.equal(s.catalog.flatMap(g=>g.items).length,22);
 assert.equal(s.price([{...line(2),price:1,unitPrice:1}]).amount,3600);
 assert.equal(s.price([{...line(2),size:'large'}]).amount,4600);
 assert.equal(s.price([line(2,'5-0')]).stamps,0);
});
test('reject malformed items, temperature, size, quantity and order limits',t=>{
 const s=fixture(t);for(const lines of [[],[null],[line(0)],[line(1.5)],[line(31)],[{...line(),id:'fake'}],[{...line(),temperature:'WARM'}],[{...line(1,'1-0'),size:'large'}],[{...line(1,'5-0'),temperature:'HOT'}],[line(30),line(30)]])assert.throws(()=>s.price(lines));
});
test('pending does not earn; payment amount and identity mismatch cannot earn',t=>{
 const s=fixture(t),order=s.createOrder('user',randomUUID(),[line(10)]);assert.equal(s.balance('user'),0);
 for(const change of [{totalAmount:1},{orderId:'other'},{currency:'USD'}])assert.throws(()=>s.applyPayment(order.id,{...payment(order),...change}));
 assert.equal(s.balance('user'),0);
});
test('same request and repeated confirmations award once',t=>{
 const s=fixture(t),key=randomUUID(),order=s.createOrder('user',key,[line(10)]);
 assert.equal(s.createOrder('user',key,[line()]).id,order.id);
 for(let i=0;i<5;i++)s.applyPayment(order.id,payment(order));
 assert.equal(s.balance('user'),10);assert.equal(s.q('SELECT COUNT(*) n FROM ledger').get().n,1);
});
test('9 stamps cannot redeem; 10 redeems once and does not earn',t=>{
 const s=fixture(t);paid(s,9);assert.throws(()=>s.redeem('user',randomUUID(),'ICE'));paid(s,1);
 const key=randomUUID(),reward=s.redeem('user',key,'HOT');assert.equal(reward.amount,0);assert.equal(s.balance('user'),0);
 assert.equal(s.redeem('user',key,'HOT').id,reward.id);assert.equal(s.balance('user'),0);
 assert.throws(()=>s.redeem('user',randomUUID(),'ICE'));
});
test('20 stamps allows two distinct cups and keeps remainder',t=>{
 const s=fixture(t);paid(s,23);s.redeem('user',randomUUID(),'ICE');s.redeem('user',randomUUID(),'HOT');assert.equal(s.balance('user'),3);
 assert.throws(()=>s.redeem('user',randomUUID(),'ICE'));
});
test('full cancellation reverses once including spent stamps; reward cancellation returns once',t=>{
 const s=fixture(t),order=paid(s,10),reward=s.redeem('user',randomUUID(),'ICE');
 s.applyPayment(order.id,payment(order,'CANCELED'));s.applyPayment(order.id,payment(order,'CANCELED'));assert.equal(s.balance('user'),-10);
 assert.throws(()=>s.applyPayment(order.id,payment(order)));
 s.cancelReward(reward.id);s.cancelReward(reward.id);assert.equal(s.balance('user'),0);
});
test('reconcile canceled payment after lost confirmation does not grant stamps',t=>{
 const s=fixture(t),order=s.createOrder('user',randomUUID(),[line(10)]);s.applyPayment(order.id,payment(order,'CANCELED'));assert.equal(s.balance('user'),0);
});
test('partial refund conservatively reverses award and order ownership is enforced',t=>{
 const s=fixture(t),order=paid(s,10);assert.throws(()=>s.ownOrder(order.id,'other'));s.applyPayment(order.id,payment(order,'PARTIAL_CANCELED'));assert.equal(s.balance('user'),0);
});

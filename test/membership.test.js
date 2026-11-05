const {test}=require('node:test');const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');const {createStore}=require('../store');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const line={id:'0-0',quantity:10,temperature:'ICE',size:'regular'};
function user(s){s.q('INSERT INTO users VALUES(?,?,?,?,?)').run('u','a@b.com','test','hash','now');}
function pay(s,quantity=10){const o=s.createOrder('u',randomUUID(),[{...line,quantity}]);const p={orderId:o.id,paymentKey:'key_'+o.id,totalAmount:o.amount,currency:'KRW',status:'DONE'};s.applyPayment(o.id,p);return {o,p};}
test('order numbers assigned at approval, sequential despite retries, failed attempts and coupons',t=>{
 const s=createStore(':memory:');t.after(()=>s.close());user(s);
 const pending=s.createOrder('u',randomUUID(),[line]);assert.equal(s.serialize(pending).number,null);
 const {o,p}=pay(s);assert.equal(s.serialize(s.getOrder(o.id)).number,1);
 for(let i=0;i<5;i++)s.applyPayment(o.id,p);
 assert.equal(s.serialize(s.getOrder(o.id)).number,1);
 const coupon=s.redeem('u',randomUUID(),'HOT');assert.equal(s.serialize(coupon).number,2);
 const next=pay(s,1);assert.equal(s.serialize(next.o).number,3);
});
test('coupon entitlement tracks 9/10/20 stamps, use and cancellation',t=>{
 const s=createStore(':memory:');t.after(()=>s.close());user(s);
 pay(s,9);assert.equal(s.coupons('u').available,0);assert.equal(s.coupons('u').progress,9);
 pay(s,11);assert.equal(s.coupons('u').available,2);
 const key=randomUUID(),reward=s.redeem('u',key,'ICE');s.redeem('u',key,'ICE');assert.equal(s.coupons('u').available,1);assert.equal(s.coupons('u').history.length,1);
 s.cancelReward(reward.id);assert.equal(s.coupons('u').available,2);assert.equal(s.coupons('u').history[0].status,'canceled');
});
test('only paid orders have three valid preparation states',t=>{
 const s=createStore(':memory:');t.after(()=>s.close());user(s);const {o}=pay(s);
 for(const status of ['received','preparing','ready'])assert.equal(s.setFulfillment(o.id,status).fulfillment,status);
 assert.throws(()=>s.setFulfillment(o.id,'completed'));
 const pending=s.createOrder('u',randomUUID(),[line]);assert.throws(()=>s.setFulfillment(pending.id,'ready'));
});
test('numbers and existing member data persist on restart',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'cafe-number-'));const file=path.join(folder,'test.sqlite');let s;
 try{s=createStore(file);user(s);const {o}=pay(s);s.close();s=createStore(file);assert.equal(s.serialize(s.getOrder(o.id)).number,1);assert.equal(s.balance('u'),10);const next=pay(s,1);assert.equal(s.serialize(next.o).number,2);}
 finally{if(s)s.close();for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));fs.rmdirSync(folder);}
});
test('legacy orders migrate to stable sequential numbers',t=>{
 const {DatabaseSync}=require('node:sqlite');const folder=fs.mkdtempSync(path.join(os.tmpdir(),'cafe-migrate-'));const file=path.join(folder,'old.sqlite');
 const db=new DatabaseSync(file);db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_key TEXT NOT NULL,kind TEXT NOT NULL,items TEXT NOT NULL,amount INTEGER NOT NULL,stamps INTEGER NOT NULL,status TEXT NOT NULL,fulfillment TEXT NOT NULL DEFAULT 'received',payment_key TEXT UNIQUE,created TEXT NOT NULL,UNIQUE(user_id,request_key));
 INSERT INTO users VALUES('u','a@b.com','name','hash','2026');
 INSERT INTO orders VALUES('old','u','key','card','[]',1800,1,'paid','completed','payment','2026');`);db.close();
 const s=createStore(file);assert.equal(s.serialize(s.getOrder('old')).number,1);assert.equal(s.getOrder('old').fulfillment,'ready');s.close();for(const name of fs.readdirSync(folder))fs.unlinkSync(path.join(folder,name));fs.rmdirSync(folder);
});

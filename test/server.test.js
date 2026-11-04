const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createApp}=require('../server');
async function fixture(t) {
 const payments=new Map();let confirmCalls=0,refundCalls=0,loseConfirm=false;
 const app=createApp({dbFile:':memory:',env:{BASE_URL:'http://localhost:3000',TOSS_CLIENT_KEY:'test_ck_unit',TOSS_SECRET_KEY:'test_sk_unit',ADMIN_EMAIL:'owner@example.com'},paymentFetch:async(url,init)=>{
   const endpoint=url.split('/v1/payments')[1];let value;
   if(endpoint==='/confirm') {confirmCalls++;const body=JSON.parse(init.body);value={orderId:body.orderId,paymentKey:body.paymentKey,totalAmount:body.amount,currency:'KRW',status:'DONE'};payments.set(body.orderId,value);if(loseConfirm){loseConfirm=false;throw new Error('timeout');}}
   else if(endpoint.startsWith('/orders/'))value=payments.get(endpoint.slice(8));
   else if(endpoint.endsWith('/cancel')) {refundCalls++;const key=decodeURIComponent(endpoint.slice(1,-7));value=[...payments.values()].find(p=>p.paymentKey===key);value={...value,status:'CANCELED'};payments.set(value.orderId,value);}
   return {ok:Boolean(value),json:async()=>value || {code:'NOT_FOUND'}};
 }});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 async function request(route,data,cookie='',origin='http://localhost:3000') {
  const response=await fetch(base+route,{headers:{...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Cafe-Request':'1'}),Cookie:cookie},method:data===undefined?'GET':'POST',...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
 }
 async function signup(email='test@example.com') {const result=await request('/api/signup',{email,password:'correct horse battery',name:'테스트'});assert.equal(result.status,200);return result;}
 return {...app,request,signup,get counts(){return {confirmCalls,refundCalls};},lost:()=>loseConfirm=true};
}
const cart=[{id:'0-0',quantity:10,temperature:'ICE',size:'regular',price:1}];
test('signup/login use hashed passwords, HttpOnly cookies, persistence and logout',async t=>{
 const f=await fixture(t),member=await f.signup();assert.match(member.headers.get('set-cookie'),/HttpOnly/);
 assert.notEqual(f.store.q('SELECT password FROM users').get().password,'correct horse battery');
 assert.equal((await f.request('/api/me',undefined,member.cookie)).data.user.email,'test@example.com');
 assert.equal((await f.request('/api/login',{email:'test@example.com',password:'wrongpassword'})).status,401);
 assert.equal((await f.request('/api/login',{email:'test@example.com',password:'correct horse battery'})).status,200);
 await f.request('/api/logout',{},member.cookie);assert.equal((await f.request('/api/me',undefined,member.cookie)).data.user,null);
});
test('deny unauthenticated, forged origin and private static file access',async t=>{
 const f=await fixture(t);assert.equal((await f.request('/api/orders',{})).status,401);
 assert.equal((await f.request('/api/signup',{email:'a@b.com'},'','https://evil.test')).status,403);
 for(const route of ['/.env','/server.js','/store.js','/data/cafe.sqlite','/package.json'])assert.equal((await f.request(route)).status,404);
});
test('card confirmation server prices, replay protection, ownership and refunds',async t=>{
 const f=await fixture(t),member=await f.signup(),other=await f.signup('other@example.com'),admin=await f.signup('owner@example.com');
 const created=await f.request('/api/orders',{requestKey:randomUUID(),items:cart},member.cookie);assert.equal(created.status,200);const order=created.data.order;assert.equal(order.amount,18000);
 assert.equal((await f.request('/api/orders/'+order.id+'/confirm',{paymentKey:'p1',amount:1},member.cookie)).status,400);
 assert.equal((await f.request('/api/orders/'+order.id+'/confirm',{paymentKey:'p1',amount:18000},other.cookie)).status,404);
 const confirm=()=>f.request('/api/orders/'+order.id+'/confirm',{paymentKey:'p1',amount:18000},member.cookie);
 assert.equal((await confirm()).status,200);assert.equal((await confirm()).status,200);assert.equal(f.counts.confirmCalls,1);
 assert.equal((await f.request('/api/me',undefined,member.cookie)).data.user.stamps,10);
 assert.equal((await f.request('/api/admin/orders',undefined,member.cookie)).status,403);
 const rewards=await Promise.all([f.request('/api/redeem',{requestKey:randomUUID(),temperature:'ICE'},member.cookie),f.request('/api/redeem',{requestKey:randomUUID(),temperature:'HOT'},member.cookie)]);
 assert.deepEqual(rewards.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.request('/api/orders/'+order.id+'/cancel',{},member.cookie)).status,403);
 assert.equal((await f.request('/api/orders/'+order.id+'/cancel',{},admin.cookie)).status,200);
 assert.equal((await f.request('/api/orders/'+order.id+'/cancel',{},admin.cookie)).status,200);assert.equal(f.counts.refundCalls,1);
 assert.equal((await f.request('/api/me',undefined,member.cookie)).data.user.stamps,-10);
});
test('timeout after gateway approval recovers through order lookup',async t=>{
 const f=await fixture(t),member=await f.signup();const {data}=await f.request('/api/orders',{requestKey:randomUUID(),items:cart},member.cookie);f.lost();
 const result=await f.request('/api/orders/'+data.order.id+'/confirm',{paymentKey:'recover',amount:18000},member.cookie);
 assert.equal(result.status,200);assert.equal(result.data.user.stamps,10);
});
test('missing keys and live keys without HTTPS cannot create card orders',async t=>{
 for(const env of [{},{TOSS_CLIENT_KEY:'live_ck_x',TOSS_SECRET_KEY:'live_sk_x',ALLOW_LIVE_PAYMENTS:'true'}]) {
  const app=createApp({dbFile:':memory:',env});const s=app.server;await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  const config=await (await fetch('http://127.0.0.1:'+s.address().port+'/api/config')).json();assert.equal(config.configured,false);await new Promise(resolve=>s.close(resolve));app.store.close();
 }
});

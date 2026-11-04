(() => {
  const $=selector=>document.querySelector(selector);
  const money=n=>n.toLocaleString('ko-KR')+'원';
  const state={user:null,config:null,catalog:[],cart:[],key:null,busy:false,redeemKey:null};
  const statuses={pending:'결제 대기',confirming:'결제 확인 중',paid:'결제 완료',cancelling:'취소 확인 중',canceled:'취소 완료',partial_canceled:'부분 취소',failed:'결제 실패'};
  const fulfillment={received:'매장 접수',preparing:'준비 중',ready:'픽업 가능',completed:'수령 완료'};
  function el(tag,text,className) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node; }
  function notice(text) { $('#order-message').textContent=text; }
  async function api(url,data) {
    const response=await fetch(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Cafe-Request':'1'},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const result=await response.json(); if(!response.ok) throw new Error(result.error || '요청에 실패했습니다.'); return result;
  }
  function persist() { try { sessionStorage.setItem('cafe-cart',JSON.stringify({cart:state.cart,key:state.key})); } catch {} }
  function clearCart() { state.cart=[];state.key=null;persist();renderCart(); }
  function button(text,fn) { const node=el('button',text);node.type='button';node.addEventListener('click',fn);return node; }
  function options(values,label) {
    const select=el('select');select.setAttribute('aria-label',label);
    values.forEach(([value,text])=>{const option=el('option',text);option.value=value;select.append(option);});return select;
  }
  function artwork(item) {
    const art=el('span',undefined,'drink-art tone-'+item.id.split('-')[0]);
    art.setAttribute('aria-hidden','true');
    const cup=el('span',undefined,item.category==='DESSERT'?'dessert-shape':'drink-cup');
    cup.append(el('span','CAFE','cup-brand'));art.append(cup);return art;
  }
  function openProduct(item) {
    const dialog=$('#product-dialog');
    $('#product-title').textContent=item.name;
    $('#product-art').replaceChildren(artwork(item));
    const temperature=options((item.options || ['']).map(v=>[v,v || '디저트']),item.name+' 온도');
    const size=options([['regular','기본'],...(item.largePrice?[['large','사이즈업 +500원']]:[])],item.name+' 사이즈');
    $('#product-temperature').replaceChildren(temperature);$('#product-size').replaceChildren(size);
    const quantity=$('#product-quantity');quantity.value='1';
    const update=()=>$('#product-add').textContent=money((size.value==='large'?item.largePrice:item.price)*Number(quantity.value||1))+' 담기';
    size.addEventListener('change',update);quantity.oninput=update;update();
    $('#product-add').onclick=()=>{
      const count=Number(quantity.value);
      if(!Number.isInteger(count)||count<1||count>30){$('#product-error').textContent='수량은 1~30개로 선택해주세요.';return;}
      const row=state.cart.find(i=>i.id===item.id&&i.temperature===temperature.value&&i.size===size.value);
      if(state.cart.reduce((s,i)=>s+i.quantity,0)+count>50||(row&&row.quantity+count>30)){$('#product-error').textContent='한 주문 최대 50개, 같은 옵션 최대 30개까지 가능합니다.';return;}
      if(row)row.quantity+=count;else state.cart.push({id:item.id,quantity:count,temperature:temperature.value,size:size.value});
      state.key=null;persist();renderCart();dialog.close();location.assign('cart.html');
    };
    $('#product-error').textContent='';dialog.showModal();
  }
  function renderShop(category='ALL') {
    const root=$('#shop-items');root.replaceChildren();
    const search=($('#menu-search')?.value||'').trim();let count=0;
    state.catalog.filter(g=>category==='ALL'||g.category===category).forEach(group=>group.items.filter(item=>item.name.includes(search)).forEach(item=>{
      const card=button('',()=>openProduct(item));card.className='product-card';card.setAttribute('aria-label',item.name+' 옵션 선택');
      card.append(artwork(item),el('span',item.options?.join(' / ')||'DESSERT','product-tag'),el('strong',item.name),el('span',money(item.price),'product-price'),el('span','+','product-plus'));root.append(card);count++;
    }));
    if(!count)root.append(el('p','검색 결과가 없습니다.','empty'));
    if($('#menu-count'))$('#menu-count').textContent=count+'개의 메뉴';
  }
  function renderCart() {
    if (!$('#cart-items')) {
      if ($('#basket-summary')) {
        let total=0,count=0;
        state.cart.forEach(line=>{const item=state.catalog.flatMap(g=>g.items).find(i=>i.id===line.id);if(item){total+=(line.size==='large'?item.largePrice:item.price)*line.quantity;count+=line.quantity;}});
        $('#basket-summary').textContent='장바구니 '+count+'개 · '+money(total);
      }
      return;
    }
    const root=$('#cart-items');root.replaceChildren();let total=0,stamps=0;
    state.cart.forEach((line,index)=>{
      const item=state.catalog.flatMap(g=>g.items).find(i=>i.id===line.id);if(!item)return;
      const price=line.size==='large'?item.largePrice:item.price;
      total+=price*line.quantity;if(item.category!=='DESSERT')stamps+=line.quantity;
      const row=el('div',undefined,'cart-row');const detail=el('div');detail.append(el('strong',item.name),el('small',`${line.temperature} · ${line.size==='large'?'사이즈업':'기본'} · ${line.quantity}개`));
      const edit=el('div',undefined,'quantity-edit');
      const decrease=button('−',()=>{if(line.quantity>1){line.quantity--;state.key=null;persist();renderCart();}});
      decrease.setAttribute('aria-label',item.name+' 수량 줄이기');decrease.disabled=line.quantity<=1;
      const increase=button('+',()=>{if(line.quantity>=30||state.cart.reduce((sum,i)=>sum+i.quantity,0)>=50)return notice('동일 옵션 최대 30개, 한 주문 최대 50개까지 가능합니다.');line.quantity++;state.key=null;persist();renderCart();});
      increase.setAttribute('aria-label',item.name+' 수량 늘리기');
      edit.append(decrease,el('span',String(line.quantity)),increase);detail.append(edit);
      const remove=button('삭제',()=>{state.cart.splice(index,1);state.key=null;persist();renderCart();});remove.setAttribute('aria-label',item.name+' 삭제');
      row.append(detail,el('span',money(price*line.quantity)),remove);root.append(row);
    });
    if(!state.cart.length)root.append(el('p','메뉴를 골라 장바구니에 담아주세요.','empty'));
    $('#cart-total').textContent=money(total);$('#cart-stamps').textContent='결제 완료 시 스탬프 '+stamps+'개 적립';
    $('#pay-button').disabled=state.busy||!state.cart.length||!state.user||!state.config?.configured;
    $('#pay-button').textContent=state.busy?'처리 중…':state.config?.mode==='test'?'테스트 카드 결제':'카드 결제';
    if ($('.cart-login')) $('.cart-login').hidden=Boolean(state.user);
    if ($('#basket-summary')) $('#basket-summary').textContent='장바구니 '+state.cart.reduce((s,i)=>s+i.quantity,0)+'개 · '+money(total);
  }
  function renderUser() {
    const user=state.user;
    if ($('#member-nav')) $('#member-nav').hidden=!user;
    if ($('#signup-nav')) $('#signup-nav').hidden=Boolean(user);
    if ($('#login-nav')) $('#login-nav').hidden=Boolean(user);
    if ($('#member-area')) $('#member-area').hidden=!user;
    if(user && $('#member-area')) {
      $('#member-name').textContent=user.name+'님, 반가워요.';
      $('#stamp-count').textContent=user.stamps+'개';
      $('#reward-count').textContent=user.stamps>=10?`무료 아메리카노 ${Math.floor(user.stamps/10)}잔 교환 가능`:`교환까지 ${10-user.stamps}개 남았어요`;
      const slots=$('#stamp-slots');slots.replaceChildren();
      const count=Math.min(10,Math.max(0,user.stamps));
      for(let i=0;i<10;i++)slots.append(el('span',i<count?'●':String(i+1),i<count?'stamp filled':'stamp'));
      $('#redeem-button').disabled=state.busy||user.stamps<10;
      $('#admin-link').hidden=!user.admin;
    }
    renderCart();
  }
  async function refreshMember() {
    state.user=(await api('/api/me')).user;renderUser();
    if (!$('#my-orders')) return;
    if (!state.user) { location.replace('login.html?next=membership.html'); return; }
    if ($('#member-loading')) $('#member-loading').hidden=true;
    const orders=$('#my-orders');orders.replaceChildren();const history=$('#stamp-history');history.replaceChildren();
    if(!state.user)return;
    const [rows,ledger]=await Promise.all([api('/api/orders'),api('/api/stamps')]);
    if(!rows.length) orders.append(el('p','아직 주문 내역이 없습니다.','empty'));
    rows.forEach(order=>{
      const card=el('article',undefined,'order-card');
      card.append(el('small',new Date(order.created).toLocaleString('ko-KR')+' · '+order.id.slice(0,8)),el('h4',statuses[order.status] || order.status));
      order.items.forEach(i=>card.append(el('p',`${i.name} ${i.temperature} · ${i.size==='large'?'사이즈업':'기본'} · ${i.quantity}개`)));
      card.append(el('strong',order.kind==='reward'?'스탬프 10개 사용':money(order.amount)));
      if(order.status==='paid')card.append(el('p',fulfillment[order.fulfillment]));
      if(order.kind==='card'&&!['canceled','failed'].includes(order.status))card.append(button('결제 상태 확인',async event=>{
        const target=event.currentTarget;target.disabled=true;
        try { await api('/api/orders/'+order.id+'/sync',{});await refreshMember();notice('결제사 기준으로 주문 상태를 확인했습니다.'); }
        catch(error){notice(error.message);}finally{target.disabled=false;}
      }));orders.append(card);
    });
    const kinds={earn:'음료 구매 적립',reverse:'결제 취소 회수',redeem:'무료 아메리카노 교환',return:'교환 취소 반환'};
    if(!ledger.history.length)history.append(el('p','첫 음료 주문부터 스탬프가 쌓여요.','empty'));
    ledger.history.forEach(entry=>{const row=el('div',undefined,'ledger-row');row.append(el('span',kinds[entry.kind]),el('span',(entry.delta>0?'+':'')+entry.delta+'개'),el('small',new Date(entry.created).toLocaleString('ko-KR')));history.append(row);});
  }
  async function handleReturn() {
    const query=new URLSearchParams(location.search);
    if(!query.has('payment')&&!query.has('paymentKey'))return;
    if(query.get('payment')==='fail'){notice('결제가 취소되었거나 완료되지 않았습니다. 장바구니에서 다시 시도해주세요.');history.replaceState(null,'',location.pathname);return;}
    if(!state.user){location.replace('login.html?next='+encodeURIComponent('cart.html'+location.search));return;}
    try {
      await api('/api/orders/'+encodeURIComponent(query.get('orderId')||'')+'/confirm',{paymentKey:query.get('paymentKey'),amount:Number(query.get('amount'))});
      clearCart();location.replace('membership.html?paid=1');
    } catch(error){notice(error.message+' 주문 내역의 결제 상태 확인을 눌러주세요.');}
  }
  async function loadSDK() {
    if(window.TossPayments)return;
    await new Promise((resolve,reject)=>{const script=el('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('결제창을 불러오지 못했습니다. 네트워크를 확인해주세요.'));};document.head.append(script);});
  }
  function nextPage() {
    const next=new URLSearchParams(location.search).get('next') || 'cart.html';
    return /^(order|cart|membership)\.html(?:\?[^#]*)?$/.test(next) ? next : 'membership.html';
  }
  function accountMode(mode) {
    const signup=mode==='signup';$('#auth-mode').value=mode;
    $('#name-field').hidden=!signup;$('#member-name-input').required=signup;
    $('#auth-submit').textContent=signup?'회원가입':'로그인';
    $('#password').autocomplete=signup?'new-password':'current-password';
    $('#account-login').setAttribute('aria-pressed',String(!signup));$('#account-signup').setAttribute('aria-pressed',String(signup));
    $('#order-message').textContent='';
  }
  $('#account-login')?.addEventListener('click',()=>accountMode('login'));
  $('#account-signup')?.addEventListener('click',()=>accountMode('signup'));
  if ($('#account-login')) accountMode(new URLSearchParams(location.search).get('mode')==='signup'?'signup':'login');
  if ($('#auth-switch')) {
    const next=new URLSearchParams(location.search).get('next');
    if (next) $('#auth-switch').href+='?next='+encodeURIComponent(nextPage());
  }
  $('#auth-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const submit=$('#auth-submit');submit.disabled=true;
    try {const data={email:$('#email').value,password:$('#password').value,name:$('#member-name-input').value};await api('/api/'+$('#auth-mode').value,data);$('#password').value='';location.assign(nextPage());}
    catch(error){notice(error.message);}finally{submit.disabled=false;}
  });
  $('#logout-button')?.addEventListener('click',async()=>{try{await api('/api/logout',{});clearCart();state.redeemKey=null;location.assign('login.html');}catch(error){notice(error.message);}});
  $('#refresh-orders')?.addEventListener('click',()=>refreshMember().catch(error=>notice(error.message)));
  $('#pay-button')?.addEventListener('click',async()=>{
    if(state.busy)return;state.busy=true;renderUser();
    try {
      state.key ||= crypto.randomUUID();persist();
      const {order,customerKey}=await api('/api/orders',{requestKey:state.key,items:state.cart});
      if(order.status==='paid'){clearCart();await refreshMember();return notice('이미 결제된 주문입니다. 주문 내역을 확인해주세요.');}
      if(order.status!=='pending')throw new Error('주문 내역에서 기존 결제 상태를 확인해주세요.');
      await loadSDK();
      await window.TossPayments(state.config.clientKey).payment({customerKey}).requestPayment({
        method:'CARD',amount:{currency:'KRW',value:order.amount},orderId:order.id,
        orderName:order.items[0].name+(order.items.length>1?' 외 '+(order.items.length-1)+'종':''),
        successUrl:location.origin+'/cart.html?payment=success',failUrl:location.origin+'/cart.html?payment=fail',
        customerEmail:state.user.email,customerName:state.user.name
      });
    } catch(error){notice(error.message || '결제가 완료되지 않았습니다. 주문 내역에서 상태를 확인해주세요.');}
    finally{state.busy=false;renderUser();}
  });
  $('#redeem-button')?.addEventListener('click',async()=>{
    if(state.busy)return;state.busy=true;renderUser();
    try {state.redeemKey ||= crypto.randomUUID();const result=await api('/api/redeem',{requestKey:state.redeemKey,temperature:$('#reward-temperature').value});state.redeemKey=null;await refreshMember();notice(`아메리카노 교환 주문이 접수되었습니다. 주문번호 ${result.order.id.slice(0,8)}를 매장에 보여주세요.`);}
    catch(error){notice(error.message);}finally{state.busy=false;renderUser();}
  });
  async function init() {
    if (document.body.dataset.page==='signup') {
      const query=new URLSearchParams(location.search);query.set('mode','signup');location.replace('login.html?'+query.toString());return;
    }
    // 메뉴와 장바구니는 서버나 결제 설정이 없어도 이용할 수 있다.
    state.catalog=menu.map((group,g)=>({...group,items:group.items.map((item,i)=>({...item,id:`${g}-${i}`,category:group.category}))}));
    state.config={configured:false,mode:'unconfigured'};
    try{const saved=JSON.parse(sessionStorage.getItem('cafe-cart'));if(saved&&Array.isArray(saved.cart)){state.cart=saved.cart.filter(i=>i&&state.catalog.flatMap(g=>g.items).some(p=>p.id===i.id)&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=30&&['regular','large'].includes(i.size));state.key=typeof saved.key==='string'?saved.key:null;}}catch{}
    const select=$('#shop-category');
    if (select) {
      state.catalog.forEach(g=>{const option=el('option',g.name);option.value=g.category;select.append(option);});
      select.addEventListener('change',()=>renderShop(select.value));
      const tabs=$('#category-tabs');
      if(tabs) [{category:'ALL',name:'전체'},...state.catalog].forEach(group=>{
        const tab=button(group.name,()=>{select.value=group.category;renderShop(select.value);tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));});
        tab.setAttribute('aria-pressed',String(group.category==='ALL'));tabs.append(tab);
      });
      $('#menu-search')?.addEventListener('input',()=>renderShop(select.value));
      $('#product-close')?.addEventListener('click',()=>$('#product-dialog').close());
      $('#quantity-minus')?.addEventListener('click',()=>{const input=$('#product-quantity');input.value=Math.max(1,Number(input.value)-1);input.dispatchEvent(new Event('input'));});
      $('#quantity-plus')?.addEventListener('click',()=>{const input=$('#product-quantity');input.value=Math.min(30,Number(input.value)+1);input.dispatchEvent(new Event('input'));});
      renderShop();renderCart();
    }
    renderCart();
    if(location.protocol==='file:'){
      notice('메뉴 담기는 가능합니다. 회원가입·로그인·결제는 cafe 폴더의 start.bat을 실행한 뒤 http://localhost:3000에서 이용해주세요.');
      if ($('#auth-submit')) $('#auth-submit').disabled=true;
      if ($('#payment-status')) $('#payment-status').textContent='메뉴를 골라 담아보세요. 실제 주문은 서버 실행 후 가능합니다.';
      if ($('#member-loading')) $('#member-loading').textContent='내 스탬프는 서버 실행 후 로그인하면 확인할 수 있습니다.';
      return;
    }
    try {state.config=await api('/api/config');} catch {notice('메뉴 담기는 가능합니다. 서버 연결을 확인해주세요.');}
    if ($('#payment-status')) $('#payment-status').textContent=state.config.mode==='test'?'테스트 결제 모드 · 실제 금액은 청구되지 않습니다.':state.config.mode==='live'?'카드 결제 가능 · 매장 픽업 주문':'카드 결제 준비 중 · 메뉴 선택과 장바구니 담기는 가능합니다.';
    await refreshMember();
    if ($('#auth-form') && state.user) {location.replace(nextPage());return;}
    await handleReturn();
    if (new URLSearchParams(location.search).get('paid')==='1') notice('결제가 완료되었습니다. 스탬프도 적립했어요.');
  }
  init().catch(error=>notice('서버 연결을 확인해주세요. '+error.message));
})();


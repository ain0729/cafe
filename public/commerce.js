(() => {
  const $=selector=>document.querySelector(selector);
  const headerMenu=$('.header-menu');
  if(headerMenu){
    const close=()=>{headerMenu.open=false;};
    document.addEventListener('click',event=>{if(!headerMenu.contains(event.target))close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&headerMenu.open){close();headerMenu.querySelector('summary').focus();}});
    headerMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  }
  const money=n=>n.toLocaleString('ko-KR')+'원';
  const state={user:null,config:null,catalog:[],cart:[],key:null,busy:false,redeemKey:null};
  const statuses={pending:'결제 대기',confirming:'결제 확인 중',paid:'결제 완료',cancelling:'취소 확인 중',canceled:'취소 완료',partial_canceled:'부분 취소',failed:'결제 실패'};
  const fulfillment={received:'주문 완료',preparing:'준비 중',ready:'준비 완료'};
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
    cup.append(el('span','SHIM','cup-brand'));art.append(cup);return art;
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
    const demo=state.config?.mode==='demo';
    $('#pay-button').hidden=demo;
    $('#cart-payment-methods').hidden=demo;
    $('#demo-order-button').hidden=!demo;
    $('#demo-order-button').disabled=state.busy||!state.cart.length;
    $('#pay-button').disabled=state.busy||!state.cart.length;
    $('#pay-button').textContent=state.busy?'처리 중…':'결제하기';
    if($('#checkout-status'))$('#checkout-status').textContent=demo?'시연용 주문 · 실제 결제 없음':!state.config?.configured?'결제 서비스 준비 중입니다. 결제수단 선택은 가능하지만 실제 결제는 아직 진행할 수 없습니다.':state.config.mode==='test'?'테스트 결제 모드 · 실제 금액은 청구되지 않습니다.':!state.user?'결제 전에 로그인해주세요. 담은 메뉴는 그대로 유지됩니다.':'카드 또는 계좌이체로 결제할 수 있습니다.';
    if ($('.cart-login')) $('.cart-login').hidden=Boolean(state.user);
    if ($('#basket-summary')) $('#basket-summary').textContent='장바구니 '+state.cart.reduce((s,i)=>s+i.quantity,0)+'개 · '+money(total);
  }
  const numberLabel=order=>order.number?'주문번호 '+String(order.number).padStart(4,'0'):'결제 대기';
  function renderUser() {
    const user=state.user;
    const login=$('#login-nav');
    if(login){
      login.hidden=false;
      login.textContent=user?'마이페이지':'로그인 / 회원가입';
      login.href=user?'account.html':'login.html';
      if(user&&document.body.dataset.page==='account')login.setAttribute('aria-current','page');
      else login.removeAttribute('aria-current');
    }
    if($('#member-area'))$('#member-area').hidden=!user;
    if(user&&$('#member-area')){
      $('#member-name').textContent=user.name+'님';if($('#admin-link'))$('#admin-link').hidden=!user.admin;
      if($('#member-email'))$('#member-email').textContent=user.email;
      if($('#stamp-count')){
        $('#stamp-count').textContent=user.stamps+'개';
        const available=Math.max(0,Math.floor(user.stamps/10));
        const progress=Math.max(0,user.stamps)%10;
        $('#reward-count').textContent=available?'무료 아메리카노 쿠폰 '+available+'장 사용 가능':'다음 쿠폰까지 '+(10-user.stamps)+'개 남았어요';
        const slots=$('#stamp-slots');slots.replaceChildren();
        for(let i=0;i<10;i++)slots.append(el('span',i<progress?'●':String(i+1),i<progress?'stamp filled':'stamp'));
        $('#redeem-button').disabled=state.busy||available<1;
        $('#coupon-count').textContent=available+'장';$('#reward-controls').hidden=!available;
        const box=$('#coupon-box');box.replaceChildren();
        if(available){const coupon=el('article',undefined,'coupon-card');coupon.append(el('small','FREE AMERICANO'),el('h4','아메리카노 무료 교환권'),el('p','HOT / ICE · 기본 사이즈'),el('strong',available+'장 사용 가능'));box.append(coupon);}
        else box.append(el('p','사용 가능한 쿠폰이 없습니다. 스탬프 10개를 모아보세요.','empty'));
      }
    }
    renderCart();
  }
  let refreshing=false;
  async function refreshMember(){
    if(refreshing)return;refreshing=true;
    try {
      state.user=(await api('/api/me')).user;renderUser();
      if(!$('#member-area'))return;
      if(!state.user){
        $('#member-loading').hidden=true;$('#login-gate').hidden=false;
        $('#gate-login').href='login.html?next='+encodeURIComponent(document.body.dataset.page+'.html'+location.search);
        if($('#completion-title'))$('#completion-title').textContent='내 주문을 확인하세요.';
        return;
      }
      if($('#login-gate'))$('#login-gate').hidden=true;
      $('#member-loading').hidden=true;
      if($('#completion-order')){
        const id=new URLSearchParams(location.search).get('orderId');
        if(!id){$('#completion-title').textContent='확인할 주문을 선택해주세요.';$('#completion-order').textContent='주문 내역에서 확인할 수 있습니다.';return;}
        const order=await api('/api/orders/'+encodeURIComponent(id));
        $('#completion-title').textContent=order.status==='paid'?'주문이 완료되었습니다.':'주문 상태를 확인해주세요.';
        const root=$('#completion-order');root.replaceChildren();
        root.append(el('strong',numberLabel(order),'completion-number'));
        if(order.status==='paid'){
          const steps=el('ol',undefined,'order-steps');const current=Object.keys(fulfillment).indexOf(order.fulfillment);
          Object.entries(fulfillment).forEach(([key,label],i)=>{const step=el('li',label,i<=current?'active':'');if(i===current)step.setAttribute('aria-current','step');steps.append(step);});root.append(steps);
        }else root.append(el('p',statuses[order.status]||order.status));
        order.items.forEach(item=>root.append(el('p',item.name+' '+item.temperature+' · '+(item.size==='large'?'사이즈업':'기본')+' · '+item.quantity+'개')));
        root.append(el('h3',order.kind==='reward'?'무료 쿠폰 사용':order.kind==='demo'?'시연용 · 실제 결제 없음':money(order.amount)));
        if(order.status==='paid')root.append(el('p',order.kind==='reward'?'스탬프 10개 사용 · 무료 음료 주문':'스탬프 '+order.stamps+'개 적립 완료'));
      }
      if($('#my-orders')){
        const rows=await api('/api/orders');const root=$('#my-orders');root.replaceChildren();
        if(!rows.length)root.append(el('p','아직 주문 내역이 없습니다.','empty'));
        rows.forEach(order=>{
          const card=el('article',undefined,'order-card');card.append(el('h3',numberLabel(order)),el('small',new Date(order.created).toLocaleString('ko-KR')));
          if(order.status==='paid'){
            const current=['received','preparing','ready'].indexOf(order.fulfillment);
            const steps=el('ol',undefined,'order-steps');steps.setAttribute('aria-label','현재 상태: '+(fulfillment[order.fulfillment]||'주문 완료'));
            Object.entries(fulfillment).forEach(([key,label],i)=>{const step=el('li',label,i<=current?'active':'');if(i===current)step.setAttribute('aria-current','step');steps.append(step);});card.append(steps);
          }else card.append(el('p',statuses[order.status]||order.status,'order-status'));
          order.items.forEach(i=>card.append(el('p',i.name+' '+i.temperature+' · '+(i.size==='large'?'사이즈업':'기본')+' · '+i.quantity+'개')));
          card.append(el('strong',order.kind==='reward'?'무료 쿠폰 사용':order.kind==='demo'?'시연용 · 실제 결제 없음':money(order.amount)));
          if(order.status==='paid'&&['card','demo'].includes(order.kind))card.append(el('small','스탬프 '+order.stamps+'개 적립'));
          if(order.kind==='card'&&!['canceled','failed'].includes(order.status))card.append(button('결제 상태 확인',async event=>{event.currentTarget.disabled=true;try{await api('/api/orders/'+order.id+'/sync',{});await refreshMember();notice('결제 상태를 확인했습니다.');}catch(error){notice(error.message);}finally{event.target.disabled=false;}}));
          const next={received:'preparing',preparing:'ready'}[order.fulfillment];
          if(state.config?.mode==='demo'&&order.kind==='demo'&&order.status==='paid'&&next){
            card.append(button('시연: '+fulfillment[next]+'로 변경',async event=>{
              const control=event.currentTarget;
              control.disabled=true;
              try{await api('/api/orders/'+order.id+'/fulfillment',{status:next});await refreshMember();}
              catch(error){notice(error.message);control.disabled=false;}
            }));
          }
          root.append(card);
        });
      }
      if($('#stamp-history')){
        const [ledger,coupons]=await Promise.all([api('/api/stamps'),api('/api/coupons')]);
        const root=$('#stamp-history');root.replaceChildren();
        const kinds={earn:'음료 구매 적립',reverse:'결제 취소 회수',redeem:'무료 쿠폰 사용',return:'쿠폰 사용 취소'};
        if(!ledger.history.length)root.append(el('p','첫 음료 주문부터 스탬프가 쌓여요.','empty'));
        ledger.history.forEach(entry=>{const row=el('div',undefined,'ledger-row');row.append(el('span',kinds[entry.kind]),el('span',(entry.delta>0?'+':'')+entry.delta+'개'),el('small',new Date(entry.created).toLocaleString('ko-KR')));root.append(row);});
        const history=$('#coupon-history');history.replaceChildren();
        if(!coupons.history.length)history.append(el('p','쿠폰 사용 내역이 없습니다.','empty'));
        coupons.history.forEach(order=>{const row=el('div',undefined,'ledger-row');row.append(el('strong',numberLabel(order)),el('span',order.status==='canceled'?'사용 취소 · 스탬프 반환':'아메리카노 '+order.items[0].temperature+' 교환'),el('small',new Date(order.created).toLocaleString('ko-KR')));history.append(row);});
      }
    }finally{refreshing=false;}
  }
  async function handleReturn() {
    const query=new URLSearchParams(location.search);
    if(!query.has('payment')&&!query.has('paymentKey'))return;
    if(query.get('payment')==='fail'){notice('결제가 취소되었거나 완료되지 않았습니다. 장바구니에서 다시 시도해주세요.');history.replaceState(null,'',location.pathname);return;}
    if(!state.user){location.replace('login.html?next='+encodeURIComponent('cart.html'+location.search));return;}
    try {
      const result=await api('/api/orders/'+encodeURIComponent(query.get('orderId')||'')+'/confirm',{paymentKey:query.get('paymentKey'),amount:Number(query.get('amount'))});
      clearCart();location.replace('complete.html?orderId='+encodeURIComponent(result.order.id));
    } catch(error){notice(error.message+' 주문 내역의 결제 상태 확인을 눌러주세요.');}
  }
  async function loadSDK() {
    if(window.TossPayments)return;
    await new Promise((resolve,reject)=>{const script=el('script');script.src='https://js.tosspayments.com/v2/standard';script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('결제창을 불러오지 못했습니다. 네트워크를 확인해주세요.'));};document.head.append(script);});
  }
  function nextPage() {
    const next=new URLSearchParams(location.search).get('next') || 'cart.html';
    return /^(order|orders|cart|membership|complete|account)\.html(?:\?[^#]*)?$/.test(next) ? next : 'membership.html';
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
  if($('#login-context')){
    const target=nextPage();$('#login-context').textContent=target.startsWith('account')?'로그인하면 마이페이지에서 계정 정보를 확인할 수 있어요.':target.startsWith('orders')?'로그인하면 주문 내역과 준비 상태를 확인할 수 있어요.':target.startsWith('membership')?'로그인하면 내 스탬프와 쿠폰을 확인할 수 있어요.':target.startsWith('complete')?'결제한 계정으로 로그인하면 주문 결과를 확인할 수 있어요.':'로그인 후 장바구니로 돌아가 결제를 계속합니다.';
  }
  if ($('#auth-switch')) {
    const next=new URLSearchParams(location.search).get('next');
    if (next) $('#auth-switch').href+='?next='+encodeURIComponent(nextPage());
  }
  $('#auth-form')?.addEventListener('submit',async event=>{
    event.preventDefault();const submit=$('#auth-submit');submit.disabled=true;
    try {const data={email:$('#email').value,password:$('#password').value,name:$('#member-name-input').value};await api('/api/'+$('#auth-mode').value,data);$('#password').value='';location.assign(nextPage());}
    catch(error){notice(error.message);}finally{submit.disabled=false;}
  });
  $('#password-change-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const submit=$('#password-change-submit'), message=$('#password-change-message');
    if(submit.disabled)return;
    const currentPassword=$('#current-password').value,newPassword=$('#new-password').value;
    if(newPassword!==$('#confirm-password').value){message.textContent='새 비밀번호가 서로 일치하지 않습니다.';return;}
    submit.disabled=true;message.textContent='';
    try {
      await api('/api/account/password',{currentPassword,newPassword});
      form.reset();
      message.textContent='비밀번호를 변경했습니다. 다른 기기는 로그아웃되었습니다.';
    }catch(error){message.textContent=error.message;}
    finally{submit.disabled=false;}
  });
  $('#logout-button')?.addEventListener('click',async()=>{try{await api('/api/logout',{});clearCart();state.redeemKey=null;location.assign('login.html');}catch(error){notice(error.message);}});
  $('#refresh-orders')?.addEventListener('click',()=>refreshMember().catch(error=>notice(error.message)));
  $('#pay-button')?.addEventListener('click',()=>{
    if(state.busy||!state.cart.length)return;
    const total=state.cart.reduce((sum,line)=>{const item=state.catalog.flatMap(g=>g.items).find(i=>i.id===line.id);return item?sum+(line.size==='large'?item.largePrice:item.price)*line.quantity:sum;},0);
    $('#payment-total').textContent=money(total);
    $('#payment-error').textContent='';
    $('#payment-availability').textContent=!state.user?'결제를 진행하려면 로그인이 필요합니다.':!state.config?.configured?'매장 결제 서비스가 아직 연결되지 않았습니다. 실제 결제는 연결 후 이용할 수 있습니다.':state.config.mode==='test'?'테스트 결제 모드입니다. 실제 금액은 청구되지 않습니다.':'결제수단을 선택하고 결제창으로 이동해주세요.';
    $('#payment-continue').textContent=state.user?'선택한 수단으로 결제하기':'로그인하고 계속하기';
    $('#payment-dialog').showModal();
  });
  $('#demo-order-button')?.addEventListener('click',async()=>{
    if(state.busy||!state.cart.length)return;
    if(!state.user){location.assign('login.html?next=cart.html');return;}
    state.busy=true;renderCart();
    try {
      state.key ||= crypto.randomUUID();persist();
      const {order}=await api('/api/demo-orders',{requestKey:state.key,items:state.cart});
      clearCart();location.assign('complete.html?orderId='+encodeURIComponent(order.id));
    } catch(error){notice(error.message);}
    finally{state.busy=false;renderCart();}
  });
  $('#payment-close')?.addEventListener('click',()=>$('#payment-dialog').close());
  $('#payment-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.user){location.assign('login.html?next=cart.html');return;}
    if(!state.config?.configured){$('#payment-error').textContent='매장 결제 서비스 연결 전입니다. 현재 실제 결제를 진행할 수 없습니다.';return;}
    const method=$('#payment-form input[name="payment-method"]:checked')?.value;
    if(!['CARD','TRANSFER'].includes(method)){$('#payment-error').textContent='결제수단을 선택해주세요.';return;}
    if(state.busy)return;state.busy=true;renderUser();
    $('#payment-continue').disabled=true;
    try {
      state.key ||= crypto.randomUUID();persist();
      const {order,customerKey}=await api('/api/orders',{requestKey:state.key,items:state.cart});
      if(order.status==='paid'){clearCart();location.assign('complete.html?orderId='+encodeURIComponent(order.id));return;}
      if(order.status!=='pending')throw new Error('주문 내역에서 기존 결제 상태를 확인해주세요.');
      await loadSDK();
      await window.TossPayments(state.config.clientKey).payment({customerKey}).requestPayment({
        method,amount:{currency:'KRW',value:order.amount},orderId:order.id,
        orderName:order.items[0].name+(order.items.length>1?' 외 '+(order.items.length-1)+'종':''),
        successUrl:location.origin+'/cart.html?payment=success',failUrl:location.origin+'/cart.html?payment=fail',
        customerEmail:state.user.email,customerName:state.user.name
      });
    } catch(error){$('#payment-error').textContent=error.message || '결제가 완료되지 않았습니다. 주문 내역에서 상태를 확인해주세요.';}
    finally{state.busy=false;renderUser();$('#payment-continue').disabled=false;}
  });
  let rewardTemperature='ICE';
  $('#redeem-button')?.addEventListener('click',()=>{
    if(state.busy)return;rewardTemperature=$('#reward-temperature').value;
    $('#reward-summary').textContent='아메리카노 '+rewardTemperature+' · 기본 사이즈 · 1잔';
    $('#reward-error').textContent='';$('#reward-confirm').showModal();
  });
  $('#reward-back')?.addEventListener('click',()=>$('#reward-confirm').close());
  $('#reward-submit')?.addEventListener('click',async()=>{
    if(state.busy)return;state.busy=true;renderUser();
    $('#reward-submit').disabled=true;
    try {state.redeemKey ||= crypto.randomUUID();const result=await api('/api/redeem',{requestKey:state.redeemKey,temperature:rewardTemperature});state.redeemKey=null;location.assign('complete.html?orderId='+encodeURIComponent(result.order.id));}
    catch(error){$('#reward-error').textContent=error.message;}finally{state.busy=false;renderUser();$('#reward-submit').disabled=false;}
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
    if ($('#payment-status')) $('#payment-status').textContent=state.config.mode==='demo'?'시연용 주문 · 실제 결제 없음':state.config.mode==='test'?'테스트 결제 모드 · 실제 금액은 청구되지 않습니다.':state.config.mode==='live'?'카드 결제 가능 · 매장 픽업 주문':'카드 결제 준비 중 · 메뉴 선택과 장바구니 담기는 가능합니다.';
    await refreshMember();
    if ($('#auth-form') && state.user) {location.replace(nextPage());return;}
    await handleReturn();
    if (new URLSearchParams(location.search).get('paid')==='1') notice('결제가 완료되었습니다. 스탬프도 적립했어요.');
  }
  init().catch(error=>notice('서버 연결을 확인해주세요. '+error.message));
  if(['orders','membership','complete'].includes(document.body.dataset.page))setInterval(()=>{if(!document.hidden&&!state.busy)refreshMember().catch(error=>notice(error.message));},10000);
})();



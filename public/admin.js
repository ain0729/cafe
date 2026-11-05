(() => {
  const root=document.querySelector('#admin-orders'),message=document.querySelector('#admin-message');
  const labels={pending:'결제 대기',confirming:'결제 확인 중',paid:'결제 완료',cancelling:'취소 확인 중',canceled:'취소 완료',partial_canceled:'부분 취소',failed:'결제 실패'};
  const fulfillment={received:'주문 완료',preparing:'준비 중',ready:'준비 완료'};
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  async function api(url,data) { const response=await fetch(url,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-Cafe-Request':'1'},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await response.json();if(!response.ok)throw new Error(result.error);return result; }
  function action(label,fn) {const button=element('button',label);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await fn();await load();message.textContent='처리했습니다.';}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});return button;}
  async function load() {
    const rows=await api('/api/admin/orders');root.replaceChildren();
    rows.forEach(order=>{
      const card=element('article');card.className='order-card';card.append(element('small',order.number?'주문번호 '+String(order.number).padStart(4,'0'):'결제 대기'),element('h3',order.customerName+' · '+labels[order.status]),element('p',new Date(order.created).toLocaleString('ko-KR')));
      order.items.forEach(item=>card.append(element('p',`${item.name} ${item.temperature} ${item.size==='large'?'사이즈업':'기본'} × ${item.quantity}`)));
      card.append(element('strong',order.kind==='reward'?'스탬프 교환':order.amount.toLocaleString('ko-KR')+'원'));
      if(order.status==='paid'){
        const select=element('select');select.setAttribute('aria-label','주문 '+order.id.slice(0,8)+' 준비 상태');
        Object.entries(fulfillment).forEach(([value,label])=>{const option=element('option',label);option.value=value;select.append(option);});select.value=order.fulfillment;
        card.append(element('p','준비 상태'),select,action('상태 저장',()=>api('/api/orders/'+order.id+'/fulfillment',{status:select.value})));
      }
      if(order.kind==='card'&&!['canceled','failed'].includes(order.status))card.append(action('결제사 상태 확인',()=>api('/api/orders/'+order.id+'/sync',{})));
      if(['paid','cancelling'].includes(order.status))card.append(action('전체 취소',async()=>{if(confirm('전체 주문을 취소할까요? 카드 결제는 전액 환불 요청되고 스탬프도 회수됩니다.'))await api('/api/orders/'+order.id+'/cancel',{});}));
      root.append(card);
    });
    if(!rows.length)root.append(element('p','주문이 없습니다.'));
  }
  document.querySelector('#admin-refresh').addEventListener('click',()=>load().catch(error=>message.textContent=error.message));
  load().catch(error=>message.textContent=error.message+'\n카페 화면에서 관리자 계정으로 로그인해주세요.');
})();

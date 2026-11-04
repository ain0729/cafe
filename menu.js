const menu = [
{category:'COFFEE',name:'커피',items:[{name:'아메리카노',price:1800},{name:'카페 라떼',price:3500},{name:'바닐라 라떼',price:3800},{name:'카페 모카',price:3900},{name:'카라멜 마끼아또',price:3900}].map(item=>({...item,largePrice:item.price+500,options:['HOT','ICE']}))},
{category:'TEA',name:'차',items:[{name:'유자차',price:3500,options:['HOT','ICE']},{name:'캐모마일 티',price:3000,options:['HOT','ICE']},{name:'녹차',price:3000,options:['HOT','ICE']},{name:'복숭아 아이스티',price:3000,options:['ICE']}]},
{category:'SMOOTHIE & FRAPPE',name:'스무디·프라페',items:['딸기 스무디','블루베리 스무디','쿠키앤크림 프라페'].map(name=>({name,price:4300,options:['ICE']}))},
{category:'ADE',name:'에이드',items:['청포도 에이드','레몬 에이드','자몽 에이드'].map(name=>({name,price:4500,options:['ICE']}))},
{category:'NON-COFFEE',name:'논커피',items:[{name:'초코 라떼',price:3500,options:['HOT','ICE']},{name:'말차 라떼',price:3800,options:['HOT','ICE']},{name:'딸기 라떼',price:3800,options:['ICE']}]},
{category:'DESSERT',name:'디저트',items:[{name:'에그타르트',price:2500},{name:'휘낭시에',price:2000},{name:'딸기 케이크',price:5000},{name:'치즈케이크',price:4800}]}
];

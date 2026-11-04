const filters = document.querySelector('#filters');
const list = document.querySelector('#menu-list');
const won = value => value.toLocaleString('ko-KR') + '원';
function render(category) {
  list.replaceChildren();
  menu.filter(group => category === 'ALL' || group.category === category).forEach(group => {
    const section = document.createElement('section');
    section.className = 'menu-group';
    const heading = document.createElement('h3');
    heading.textContent = group.category;
    const label = document.createElement('p');
    label.className = 'category-label';
    label.textContent = group.name;
    section.append(heading, label);
    group.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'menu-row';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const options = document.createElement('small');
      options.textContent = (item.options || []).join(' / ');
      info.append(name, options);
      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = won(item.price);
      if (item.largePrice) {
        const large = document.createElement('small');
        large.textContent = '사이즈업 ' + won(item.largePrice);
        price.append(large);
      }
      row.append(info, price);
      section.append(row);
    });
    list.append(section);
  });
}
[{category:'ALL',name:'전체'}, ...menu].forEach(group => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = group.name;
  button.setAttribute('aria-pressed', String(group.category === 'ALL'));
  button.addEventListener('click', () => {
    filters.querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
    render(group.category);
  });
  filters.append(button);
});
render('ALL');

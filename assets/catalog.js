(function (root) {
'use strict';
function validateApps(value) {
  if (!Array.isArray(value)) throw new Error('登録一覧は配列で指定してください。');
  const ids = new Set();
  return value.map(function (app) {
    if (!app || typeof app.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.id)) throw new Error('不正なアプリIDです。');
    if (ids.has(app.id)) throw new Error('アプリIDが重複しています: ' + app.id);
    ids.add(app.id);
    for (const field of ['name','description','category']) if (typeof app[field] !== 'string' || !app[field].trim()) throw new Error('必須項目がありません: ' + field);
    if (!Array.isArray(app.tags) || app.tags.some(t => typeof t !== 'string' || !t.trim())) throw new Error('タグは文字列の配列で指定してください。');
    return { id:app.id, name:app.name.trim(), description:app.description.trim(), category:app.category.trim(), tags:app.tags.map(t=>t.trim()), href:'apps/'+app.id+'/index.html' };
  });
}
function filterApps(apps, query, category) {
 const terms = query.normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean);
 return apps.filter(a => (!category || a.category === category) && terms.every(t => [a.name,a.description,a.category,...a.tags].join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(t)));
}
const api={validateApps,filterApps}; root.AppCatalog=api;
if(typeof module!=='undefined' && module.exports) module.exports=api;
})(globalThis);

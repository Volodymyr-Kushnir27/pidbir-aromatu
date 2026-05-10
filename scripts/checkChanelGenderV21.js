require('dotenv').config();
const { searchByNameAndKeywords, detectGenderFromQuery, cleanDirectQuery } = require('../src/search/directNameKeywordSearch');

const queries = [
  'чоловічі шанель',
  'шанель чоловічі',
  'мужские шанель',
  'chanel men',
  'жіночі шанель',
  'шанель',
];

for (const q of queries) {
  const rows = searchByNameAndKeywords(q, { limit: 20, scanLimit: 5000 });
  console.log('\n==============================');
  console.log('QUERY:', q);
  console.log('CLEAN:', cleanDirectQuery(q));
  console.log('GENDER:', detectGenderFromQuery(q));
  console.log('COUNT:', rows.length);
  console.table(rows.slice(0, 10).map(x => ({
    id: x.id,
    code: x.number_code || x.code,
    name: x.name,
    gender: x.gender || x.for_whom,
    field: x.direct_match_field,
    type: x.direct_match_type,
    score: x.match_score,
    why: Array.isArray(x.why_selected) ? x.why_selected.join(' | ') : '',
  })));
}

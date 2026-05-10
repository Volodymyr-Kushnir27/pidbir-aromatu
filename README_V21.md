# V21 — Direct brand search + gender filter fix

Fixes queries like:

- `чоловічі шанель`
- `шанель чоловічі`
- `мужские шанель`
- `chanel men`

Problem: direct brand search returned all Chanel matches and did not filter by requested gender, so female Chanel cards could appear first.

## Apply locally

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"
unzip ~/Downloads/pidbir-aromatu-v21-direct-brand-gender-fix.zip -d .
node scripts/applyDirectBrandGenderFixV21.js
CATALOG_DB_PATH=./data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkChanelGenderV21.js
```

If local DB is `perfumes_filtered.sqlite`:

```bash
CATALOG_DB_PATH=./data/perfumes_filtered.sqlite SEARCH_DEBUG=1 node scripts/checkChanelGenderV21.js
```

## Git

```bash
git add src/search/directNameKeywordSearch.js scripts/applyDirectBrandGenderFixV21.js scripts/checkChanelGenderV21.js README_V21.md
git commit -m "Fix direct brand search gender filtering"
git push
```

## Render after deploy

```bash
cd /opt/render/project/src
CATALOG_DB_PATH=/var/data/perfumes.sqlite SEARCH_DEBUG=1 node scripts/checkChanelGenderV21.js
```

Then Manual Restart.

Expected: `чоловічі шанель` returns only male/unisex Chanel, not female Chanel.

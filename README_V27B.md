# V27B — fix duplicate Exact Note Router

Цей пакет виправляє помилку Render:

```txt
SyntaxError: Identifier 'handledExactNote' has already been declared
```

Причина: у `src/index.js` двічі вставлений блок:

```js
const handledExactNote = await onExactNoteText(ctx);
if (handledExactNote) return;
```

У JavaScript не можна двічі оголошувати `const handledExactNote` в одному scope.

## Як застосувати локально

```bash
cd "/Users/volodumurkushnir/dev/Bot-Підбір аромату"

unzip ~/Downloads/pidbir-aromatu-v27b-duplicate-router-fix.zip -d .

node scripts/fixDuplicateExactNoteRouterV27b.js
node -c src/index.js
```

## Далі push

```bash
git add src/index.js scripts/fixDuplicateExactNoteRouterV27b.js
git commit -m "Fix duplicate exact note router declaration"
git push
```

## Як швидко виправити напряму на Render

```bash
cd /opt/render/project/src

node scripts/fixDuplicateExactNoteRouterV27b.js
node -c src/index.js
```

Після цього зроби Manual Restart.

> Але правильніше — виправити локально, зробити commit/push і дати Render автоматично redeploy.

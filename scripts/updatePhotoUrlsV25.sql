UPDATE perfumes
SET photo = 'https://strgimgr.b-cdn.net/sized/840/722783-ad669602f1d2f74e19f885e01e50d70e.jpg?height=384&quality=90&width=384'
WHERE UPPER(number_code) IN ('155A','155А');

UPDATE perfumes
SET photo = 'https://content2.rozetka.com.ua/goods/images/big/10809203.jpg'
WHERE UPPER(number_code) IN ('61A','61А');

UPDATE perfumes
SET photo = 'https://edp.ua/upload/shop_images/big2/big_img-molecule-03-tualetnaya-voda-100-ml-1615458398.webp'
WHERE UPPER(number_code) IN ('208A','208А');

SELECT id, number_code, name, photo
FROM perfumes
WHERE UPPER(number_code) IN ('155A','155А','61A','61А','208A','208А')
ORDER BY id;

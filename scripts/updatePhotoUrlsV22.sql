-- V22 photo URL updates
-- Render: sqlite3 /var/data/perfumes.sqlite < scripts/updatePhotoUrlsV22.sql

UPDATE perfumes
SET photo = 'https://birmarket.az/ru/product/722783-giorgio-armani-code-parfum-parfyumernaya-voda-dlya-muzhchin-125-ml'
WHERE number_code IN ('155A','155А')
   OR name LIKE '%Giorgio Armani%Black Code%';

UPDATE perfumes
SET photo = 'https://content2.rozetka.com.ua/goods/images/big/10809203.jpg'
WHERE number_code IN ('61A','61А')
   OR name LIKE '%Hugo Boss%Hugo%';

UPDATE perfumes
SET photo = 'https://edp.ua/upload/shop_images/big2/big_img-molecule-03-tualetnaya-voda-100-ml-1615458398.webp'
WHERE number_code IN ('208A','208А')
   OR name LIKE '%Escentric Molecules%Molecule 03%';

SELECT id, number_code, name, photo
FROM perfumes
WHERE number_code IN ('155A','155А','61A','61А','208A','208А')
   OR name LIKE '%Giorgio Armani%Black Code%'
   OR name LIKE '%Hugo Boss%Hugo%'
   OR name LIKE '%Escentric Molecules%Molecule 03%';

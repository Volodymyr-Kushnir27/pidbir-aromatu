-- V29: aliases for 330A Marc-Antoine Barrois "Ganymede"

UPDATE perfumes
SET
  version = COALESCE(version, '') || '
Ганімед
Ганимед
Ганнимед
Ганиммед
Номер Ганимед
Номер Ганімед
Номер Ганнимед
Номер Ганиммед
Ганімед номер
Ганимед номер
Ganymede
Marc-Antoine Barrois Ganymede
Marc Antoine Barrois Ganymede
Марс Антуан Барруа Ганімед
Марк Антуан Барруа Ганімед',
  keywords = COALESCE(keywords, '') || '
ганімед
ганимед
ганнимед
ганиммед
ganymede'
WHERE number_code = '330A'
   OR number_code = '330А'
   OR number_codes LIKE '%330%'
   OR name LIKE '%Ganymede%';

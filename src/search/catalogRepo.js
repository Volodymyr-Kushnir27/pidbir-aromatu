function getPerfumeById(id) {
  return db.prepare(`
    SELECT
      id,
      photo,
      number_code,
      name,
      premiere,
      type,
      for_whom,
      season,
      occasion,
      age,
      notes,
      keywords,
      description
    FROM perfumes
    WHERE id = ?
    LIMIT 1
  `).get(id);
}

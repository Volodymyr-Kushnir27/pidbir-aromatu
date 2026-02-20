function fmtList(items, title) {
  if (!items.length) return `${title}\n(порожньо)`;

  const lines = items.map((x, i) => {
    const phone = x.phone ? x.phone : "—";
    const tg = x.tg_id ? x.tg_id : "—";
    return `${i + 1}) ${x.fio} | phone: ${phone} | tg_id: ${tg}`;
  });

  return `${title}\n\n` + lines.join("\n");
}

module.exports = { fmtList };

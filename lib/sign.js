const crypto = require('crypto');

/**
 * Реализация алгоритма подписи V5Pay (см. документацию, раздел "签名算法"):
 *
 * 1. Взять все непустые параметры (кроме самого поля `sign`).
 * 2. Отсортировать ключи по ASCII-коду (лексикографически, с учётом регистра).
 * 3. Склеить в строку вида key1=value1&key2=value2...
 * 4. В конец строки дописать secretKey.
 * 5. Посчитать MD5 от получившейся строки -> это и есть подпись.
 */
function buildSignString(params) {
  const keys = Object.keys(params)
    .filter((k) => {
      if (k === 'sign') return false;
      const v = params[k];
      return v !== undefined && v !== null && String(v) !== '';
    })
    // Стандартная сортировка строк в JS по code point совпадает с ASCII-сортировкой
    // для латиницы/цифр, которые только и встречаются в именах параметров V5Pay.
    .sort();

  return keys.map((k) => `${k}=${params[k]}`).join('&');
}

/** Строит подпись для исходящего запроса к V5Pay. */
function sign(params, secretKey) {
  const plainText = buildSignString(params);
  const signTemp = plainText + secretKey;
  return crypto.createHash('md5').update(signTemp, 'utf8').digest('hex');
}

/** Проверяет подпись входящего callback-запроса от V5Pay. */
function verify(params, secretKey) {
  const received = params.sign;
  if (!received) return false;
  const rest = { ...params };
  delete rest.sign;
  const expected = sign(rest, secretKey);
  return expected.toLowerCase() === String(received).toLowerCase();
}

module.exports = { buildSignString, sign, verify };

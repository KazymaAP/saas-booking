'use strict';
// служебное/scripts/lib/panel-password.cjs — генератор временных паролей для кабинетов.
//
// Зачем отдельный модуль: пароль выдаётся служебными скриптами (provision и rotate),
// а проверяется unit-тестом. Одна реализация — один набор правил.
//
// Алфавит без похожих символов (0/O/o, 1/l/I): пароль диктуют по телефону и копируют из CSV.
// 16 символов из 56 — около 93 бит энтропии, перебором не берётся.

const crypto = require('node:crypto');

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIGITS = '23456789';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';

// Граница для rejection sampling: отбрасываем «хвост», который дал бы перекос по modulo.
const LIMIT = 256 - (256 % ALPHABET.length);

function randomFrom(set, bytes, cursor) {
  // Возвращает [символ, новый курсор]. Если байты кончились — добираем.
  let buf = bytes;
  let i = cursor;
  for (;;) {
    while (i < buf.length) {
      const b = buf[i];
      i += 1;
      if (b < LIMIT) return [set[b % set.length], i];
    }
    buf = crypto.randomBytes(32);
    i = 0;
  }
}

/**
 * Пароль из разрешённого алфавита, где гарантированно есть строчная, заглавная и цифра.
 * @param {number} [length]
 * @returns {string}
 */
function generatePanelPassword(length = 16) {
  if (!Number.isInteger(length) || length < 12) {
    throw new Error('Длина временного пароля — не меньше 12 символов');
  }
  for (;;) {
    let bytes = crypto.randomBytes(length * 2);
    let cursor = 0;
    const chars = [];
    for (let n = 0; n < length; n += 1) {
      const [ch, next] = randomFrom(ALPHABET, bytes, cursor);
      chars.push(ch);
      cursor = next;
    }
    const password = chars.join('');
    const ok = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
    if (ok) return password;
  }
}

module.exports = { generatePanelPassword, ALPHABET, DIGITS, UPPER, LOWER };

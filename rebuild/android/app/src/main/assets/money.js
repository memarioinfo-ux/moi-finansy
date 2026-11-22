"use strict";
// Financial values are integer minor units. Avoid floating-point conversion
// even in display code: a balance of 0.01 must never be rounded away.
(function (root) {
  function minor(value) {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new RangeError("Unsafe financial amount");
    }
    const text = String(value);
    if (!/^-?\d+$/.test(text)) throw new TypeError("Invalid financial amount");
    return BigInt(text);
  }

  function input(value) {
    const total = minor(value);
    const abs = total < 0n ? -total : total;
    return (total < 0n ? "-" : "") +
      (abs / 100n).toString() + "," +
      (abs % 100n).toString().padStart(2, "0");
  }

  function format(value, currency = "BYN") {
    const total = minor(value);
    const abs = total < 0n ? -total : total;
    const whole = new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 0
    }).format(abs / 100n);
    return (total < 0n ? "−" : "") + whole + "," +
      (abs % 100n).toString().padStart(2, "0") + " " + currency;
  }

  const api = Object.freeze({ minor, input, format });
  if (root) root.FinanceMoney = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : null);

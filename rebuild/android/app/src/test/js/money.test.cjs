"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const money = require("../../main/assets/money.js");

test("tiny expenses and negative balances are exact", () => {
  assert.equal(money.format(1, "BYN"), "0,01 BYN");
  assert.equal(money.input(-705), "-7,05");
  assert.equal(money.format(-1, "USD"), "−0,01 USD");
});

test("large integer minor amounts keep their last kopeck", () => {
  assert.equal(money.input("9007199254740991"), "90071992547409,91");
  assert.match(money.format("9007199254740991", "EUR"), /,91 EUR$/);
});

test("unsafe fractional or floating-point inputs cannot be formatted", () => {
  assert.throws(() => money.format(1.1, "BYN"), RangeError);
  assert.throws(() => money.format(Number.MAX_SAFE_INTEGER + 1, "BYN"), RangeError);
  assert.throws(() => money.format("12,34", "BYN"), TypeError);
});

test("minor conversion stays within exact integers", () => {
  assert.equal(money.minor("100"), 100n);
  assert.equal(money.minor(0), 0n);
});

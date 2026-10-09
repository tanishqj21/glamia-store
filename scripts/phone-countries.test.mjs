import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_COUNTRIES, REGION_CALLING_CODES, composePhone, splitPhone } from '../react-app/src/lib/phoneCountries.js';

test('all 245 geographic regions have named, independently selectable options', () => {
  assert.equal(Object.keys(REGION_CALLING_CODES).length,245);
  assert.equal(PHONE_COUNTRIES.length,245);
  assert.equal(new Set(PHONE_COUNTRIES.map(c=>c.region)).size,245);
  assert.equal(new Set(PHONE_COUNTRIES.map(c=>c.value)).size,245);
  assert.equal(PHONE_COUNTRIES[0].region,'IN');
  for(const country of PHONE_COUNTRIES) {
    assert.match(country.code,/^\+[1-9]\d{0,2}$/);
    assert.ok(country.name && country.name!==country.region);
    assert.equal(country.code,`+${REGION_CALLING_CODES[country.region]}`);
  }
  const rest=PHONE_COUNTRIES.slice(1).map(c=>c.name);
  assert.deepEqual(rest,[...rest].sort((a,b)=>a.localeCompare(b,'en')));
});

test('shared codes distinguish Canada/US, Kazakhstan/Russia and Crown dependencies', () => {
  const entry=region=>PHONE_COUNTRIES.find(c=>c.region===region);
  for(const [a,b,code] of [['CA','US','+1'],['KZ','RU','+7'],['JE','GB','+44'],['GG','GB','+44'],['VA','IT','+39']]) {
    assert.equal(entry(a).code,code);assert.equal(entry(b).code,code);
    assert.notEqual(entry(a).value,entry(b).value);
  }
  assert.equal(entry('GB').label,'UK');assert.equal(entry('GB').value,'+44');
  for(const [region,code] of [['PH','+63'],['NG','+234'],['PK','+92'],['XK','+383'],['AC','+247'],['TA','+290'],['TW','+886']])assert.equal(entry(region).code,code);
});

test('every supported prefix survives composition including empty or partially typed numbers', () => {
  for(const code of new Set(PHONE_COUNTRIES.map(c=>c.code))) {
    for(const number of ['', '1', '123', '0123456789'])assert.deepEqual(splitPhone(composePhone(code,number)),{countryCode:code,number});
  }
});

test('existing saved international/local numbers retain their prefix and national part', () => {
  for(const [value,countryCode,number] of [['+44 9876543210','+44','9876543210'],['+1 (416) 555-0123','+1','4165550123'],['+7 701 555 1234','+7','7015551234'],['+234 0801234567','+234','0801234567'],['+358401234567','+358','401234567'],['9876543210','+91','9876543210']])assert.deepEqual(splitPhone(value),{countryCode,number});
});

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

var moment = require('moment')
  ,_ = require('underscore');

//-----------------------------------------------------------------------------
// Public
//-----------------------------------------------------------------------------

function keyFor (action, date) {
  action = action || 'active';

  if (!moment.isMoment(date)) {
    date = date ? moment.utc(date) : moment.utc();
  }

  date = date.format('YYYY-MM-DD');
  return [action, date].join('-');
}

function toBinaryString (buffer) {
  const buffer64 = to64Bits(buffer);
  var binaryBigint = buffer64.readBigInt64BE();
  return binaryBigint.toString(2);
}

function to64Bits (buffer) {
  if (buffer.length < 8) {
    const bufZeros = Buffer.alloc(8 - buffer.length);
    buffer = Buffer.concat([bufZeros, buffer], 8);
  }
  return buffer;
}

function monthKeys (date, action) {
  var keys = _.times(date.daysInMonth(), function (n) {
    var day = date.startOf('month').add('days', n);
    return keyFor(action, day);
  });

  return keys;
}

function weekKeys (date, action) {
  var keys = _.times(7, function (n) {
    var day = date.startOf('week').add('days', n);
    return keyFor(action, day);
  });

  return keys;
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

exports.keyFor = keyFor;
exports.toBinaryString = toBinaryString;
exports.to64Bits = to64Bits;
exports.monthKeys = monthKeys;
exports.weekKeys = weekKeys;
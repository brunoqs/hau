//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

var util = require('./util')
  , moment = require('moment')
  , async = require('async')
  , _ = require('underscore');

const { promisify } = require('util');

//-----------------------------------------------------------------------------
// Public
//-----------------------------------------------------------------------------

/**
  General Note:

  When using the active-user object, you do not need to pass in the client
  parameter. It is already filled in via underscore.js's #partial method.

  Example:

    var activity = activeUser.createClient();

    activity.daily(function (err, num) {
      console.log(num); // Today's daily active users.
    });
**/

/**
 * Reports daily active users for a given date.
 *
 * @param {Object} client The Redis client.
 * @param {String} [action] The tracked action.
 * @param {String} [date] The date of the action. Defaults to the current day.
 * @param {Function (err Error, num Number)} callback
 */
function daily (client, action, date, callback) {
  if (arguments.length == 4) {
    date = moment.utc(date);
  }

  // Assume we are missing a date.
  if (arguments.length == 3) {
    callback = date;
    date = moment.utc();
  }

  // We have only a client and a callback.
  if (arguments.length == 2) {
    callback = action;
    action = null;
    date = moment.utc();
  }

  var key = util.keyFor(action, date);
  activeUsers(client, key, callback);
}

/**
 * Reports weekly active users for a given date.
 *
 * @param {Object} client The Redis client.
 * @param {String} [action] The tracked action.
 * @param {String} [date] The date of the action. Defaults to the current week.
 * @param {Function (err Error, num Number)} callback
 */
function weekly (client, action, date, callback) {
  if (arguments.length == 4) {
    date = moment.utc(date);
  }

  // Assume we are missing a date.
  if (arguments.length == 3) {
    callback = date;
    date = moment.utc();
  }

  // We have only a client and a callback.
  if (arguments.length == 2) {
    callback = action;
    action = null;
    date = moment.utc();
  }

  var keys = util.weekKeys(date, action);

  activeUsers(client, keys, callback);
}

/**
 * Reports monthly active users for a given date.
 *
 * @param {Object} client The Redis client.
 * @param {String} [action] The tracked action.
 * @param {String} [date] The date of the action. Defaults to the current
          month.
 * @param {Function (err Error, num Number)} callback
 */
function monthly (client, action, date, callback) {
  if (arguments.length == 4) {
    date = moment.utc(date);
  }

  // Assume we are missing a date.
  if (arguments.length == 3) {
    callback = date;
    date = moment.utc();
  }

  // We have only a client and a callback.
  if (arguments.length == 2) {
    callback = action;
    action = null;
    date = moment.utc();
  }

  var keys = util.monthKeys(date, action);

  activeUsers(client, keys, callback);
}

/**
 * Get an array of active users with date.
 *
 * @param {Object} client The Redis client.
 * @param {String} [type] Search by M - Month, W - Week, D - Day
 * @param {String} [action] The tracked action.
 * @param {String} [date] The date of the action. Defaults to the current
          month.
 * @param {Function (err Error, num Number)} callback
 */
async function getUsers (client, type, action, date, callback) {
  const strlenAsync = promisify(client.strlen).bind(client);
  const getbitAsync = promisify(client.getbit).bind(client);
  let keys;

  if (arguments.length == 5) {
    date = moment.utc(date);
  }

  // Assume we are missing a date.
  if (arguments.length == 4) {
    callback = date;
    date = moment.utc();
  }

  if (arguments.length == 3) {
    callback = action;
    action = null;
    date = moment.utc();
  }

  if (arguments.length == 2) {
    callback = type;
    action = null;
    type = 'W';
    date = moment.utc();
  }

  if (type === 'D') {
    keys = [util.keyFor(action, date)];
  } else if (type === 'W') {  
    keys = util.weekKeys(date, action);
  } else if (type === 'M') {
    keys = util.monthKeys(date, action); 
  }

  let dateParts = keys[0].split('-');
  const from = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
  dateParts = keys[keys.length-1].split('-');
  const to = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;
  const usersList = {
    from,
    to,
    ids: []
  };
  await Promise.all( await keys.map(async (item) => {
    const bitmapLen = await strlenAsync(item) * 8;
    if (bitmapLen) {
      let user = 0;
      for (let i = 0; i < bitmapLen; i++) {
        user = await getbitAsync(item, i)
        dateParts = item.split('-')
        if (user === 1) {
          usersList.ids.push({id: i, date: moment(`${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`).format('YYYY-MM-DD')});
        }
      }
    }
  }));

  callback(null, usersList);
}

//-----------------------------------------------------------------------------
// Private
//-----------------------------------------------------------------------------

/**
 * Determines the number of active users for a given set of active-user keys.
 *
 * @param {Object} client The Redis client.
 * @param {Array} keyOrKeys The Redis keys for the days to be fetched.
 * @param {Function (err Error, num Number)} callback
 */
function activeUsers (client, keyOrKeys, callback) {
  var keys = 'string' === typeof keyOrKeys ? [keyOrKeys] : keyOrKeys;

  async.map(keys, client.get.bind(client), function (err, results) {
    if (err) return callback(err);

    var binaryBigint = _.reduce(results, function (memo, buffer) {
      var dailyBigint;
      if (buffer) {
        const buffer64 = util.to64Bits(buffer);
        dailyBigint = buffer64.readBigInt64BE();
      } else {
        dailyBigint = BigInt(0);
      }
      return dailyBigint | memo;
    }, BigInt(0));

    callback(null, cardinality(binaryBigint));
  });
}

/**
 * Caculates the cardinality of a BitSet.
 *
 * @param {Object} binaryBigint A Bigint BitSet.
 * @returns {Number} The cardinality of the BitSet.
 */
function cardinality (binaryBigint) {
  var binaryString = binaryBigint.toString(2)
    , len = binaryString.length
    , cardinality = 0

  for (var i = 0; i < len; i++) {
    if (binaryString.charAt(i) == '1') {
      cardinality++;
    }
  }

  return cardinality;
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

exports.daily = daily;
exports.weekly = weekly;
exports.monthly = monthly;
exports.getUsers = getUsers;
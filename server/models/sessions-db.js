'use strict';

var query = require('../config.js').query;

module.exports.open = function (instance, callback) {
  var q = 'INSERT INTO session (instance_id, component_id, created) \
           VALUES ($1, $2, NOW()) \
           RETURNING session_id';
  var values = [
    instance.instanceId,
    instance.compId
  ];

  query.first(q, values, function (err, rows, result) {
    if (err) {
      console.error('db session insert error: ', err);
      return callback(err, null);
    }

    callback(null, rows.session_id);
  });
}


module.exports.isOpen = function (sessionId, callback) {
  var q = 'SELECT closed \
           FROM session \
           WHERE session_id = $1';
  var values = [
    sessionId
  ];

  query.first(q, values, function (err, rows, result) {
    if (err) {
      console.error('db session isOpen error: ', err);
      return callback(err, null);
    }

    callback(null, !rows.closed);
  });
}

// prolongs session by updating lastest access to current time
// function update(sessionId, callback) {
//   var q = 'UPDATE session \
//            SET last_access = NOW() \
//            WHERE session_id = $1';
//   var values = [
//     sessionId,
//   ];

//   query(q, values, function (err, rows, result) {
//     if (err) {
//       console.error('db session update error: ', err);
//       return callback(err);
//     }

//     callback(null);
//   });
// }

module.exports.close = function (sessionId, callback) {
  var q = 'UPDATE session \
           SET closed = $1 \
           WHERE session_id = $2 \
           AND closed = $3 \
           RETURNING *';
  var values = [
    true,
    sessionId,
    false
  ];

  query.first(q, values, function (err, rows, result) {
    if (err) {
      console.error('db session close error: ', err);
      return callback(err, null);
    }

    callback(null, rows);
  });
}
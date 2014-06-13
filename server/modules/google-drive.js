'use strict';

var fs = require('fs');
var googleapis = require('googleapis');
var qs = require('querystring');
var request = require('request');
var async = require('async');



function getGoogleUploadUrl(file, accessToken, callback) {
  var ROOT_URL = 'https://www.googleapis.com/';
  var DRIVE_API_PATH = 'upload/drive/v2/files';
  var fileDesc = {
    title: file.originalname,
    mimeType: file.mimetype,
  };

  var params = { uploadType: 'resumable' };

  var options = {
    url: constructUrl(ROOT_URL, DRIVE_API_PATH, params),
    method: 'POST',
    headers: {
      'X-Upload-Content-Type': file.mimetype,
      'X-Upload-Content-Length': file.size,
      'Authorization': 'Bearer ' + accessToken
    },
    body: fileDesc,
    json: true
  };

  request(options, function (err, res, body) {

    if (err) {
      console.error('request error', err);
      return callback(err, null);
    }

    if (res.statusCode !== 200) {
      var errorMessage = 'Cannot retrieve Google Drive upload URL: ' +
                          body.error.code + ' ' +
                          body.error.messsage;
      return callback(new Error(errorMessage), null);
    }

    var uploadUrl = res.headers.location;
    callback(err, uploadUrl);
  });
}

function requestUploadStatus(file, uploadUrl, accessToken, waitFor, callback) {
  var options = {
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Range': 'bytes */' + file.size
    }
  };

  setTimeout(request(options, function (err, res) {
    if (!err && res.statusCode === 308) { // Resume Incomplete
      var range = res.headers.range;
      var uploadedSoFar = parseInt(range.split('-')[1], 10);
      callback(err, uploadedSoFar + 1, res.statusCode);
    } else if (err) {
      console.error('requestUploadStatus error');
      callback(err, 0, 404);
    } else {
      callback(err, 0, res.statusCode);
    }
  }), waitFor);
}


function recoverUploadToGoogle(file, uploadUrl, accessToken, callback) {
  var watingTimes = [0, 1000, 2000, 4000, 8000, 16000];
  var startFrom = 0;
  var recoverCount = 0;
  var statusCode = 500;
  async.whilst(
    function () {
      return statusCode !== 308 && recoverCount < watingTimes.length;
    },
    function (callback) {
      requestUploadStatus(file, uploadUrl, accessToken, watingTimes[recoverCount], function (err, startUploadFrom, newStatusCode) {
        startFrom = startUploadFrom;
        statusCode = newStatusCode;
        recoverCount++;
        callback(err);
      });
    },
    function (err) {
      if (statusCode !== 308) {
        callback(err, startFrom);
      } else {
        callback(new Error('Google Drive is unavailable'), startFrom);
      }
    }
  );
}




// todo set a limit to a number of recovers
function uploadFileToGoogle(file, uploadUrl, accessToken, start, callback) {

  var options = {
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
    }
  };

  var readStream;
  if (start > 0) { // don't start from zeros byte
    readStream = fs.createReadStream(file.path, { start: start, end: file.size - 1 });
    options.headers['Content-Range'] = 'bytes ' + start + '-' + (file.size - 1) + '/' + file.size - 1;
  } else { // start from zeros byte
    readStream = fs.createReadStream(file.path);
  }

  readStream.on('open', function () {
    readStream.pipe(request(options, function (err, res) {
      if (err) {
        return callback(err, res);
      }

      console.log('google uploaded status code: ', res.statusCode);

      var recoverWhenStatus = [500, 501, 502, 503];

      if (recoverWhenStatus.indexOf(res.statusCode) > -1) {
        recoverUploadToGoogle(file, uploadUrl, accessToken, function (err, startUploadFrom) {
          if (err) {
            console.error('google upload recover error: ', err);
            callback(err, null);
          } else {
            uploadFileToGoogle(file, uploadUrl, accessToken, startUploadFrom, function (err, result) {
              callback(err, result);
            });
          }
        });
      } else {
        callback(err, res.body);
      }
    }));
  });

  readStream.on('error', function (err) {
    throw err;
  });
}


function insertFile(file, accessToken, callback) {
  console.log('insering file to google');
  getGoogleUploadUrl(file, accessToken, function (err, uploadUrl) {
    if (err) { console.error('google request error: ', err); }
    console.log('google file upload url: ', uploadUrl);
    uploadFileToGoogle(file, uploadUrl, accessToken, 0, function (err, result) {
      if (err) { console.error('upload error: ', err); }
      callback(err, result);
    });
  });
}


module.exports = {
  insertFile: insertFile,
};
